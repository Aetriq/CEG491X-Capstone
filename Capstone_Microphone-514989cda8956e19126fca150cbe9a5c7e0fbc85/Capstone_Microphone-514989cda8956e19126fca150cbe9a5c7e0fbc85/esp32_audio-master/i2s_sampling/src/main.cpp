#include <Arduino.h>
#include "I2SMEMSSampler.h"
#include "ADCSampler.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "WiFiCredentials.h"
// Extra ESP headers for improved crash/reset diagnostics
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <esp_heap_caps.h>
ADCSampler *adcSampler = NULL;
I2SSampler *i2sSampler = NULL;

// Onboard NeoPixel pins (user provided): data on GPIO33, power control on GPIO21
// NeoPixel pins (user provided): data on GPIO33, power control on GPIO21
#ifndef NEOPIXEL_PIN
#define NEOPIXEL_PIN 33
#endif
#ifndef NEOPIXEL_POWER_PIN
#define NEOPIXEL_POWER_PIN 21
#endif

// NOTE: WiFi/HTTP functionality removed. USB streaming is used for audio transport.

// i2s config placeholder for ADC (not used on ESP32-S3 -- ADC sampling uses adc1_get_raw or adc_continuous)
i2s_config_t adcI2SConfig = {
  .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
  .sample_rate = 16000,
  .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
  .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
  .communication_format = I2S_COMM_FORMAT_I2S_LSB,
  .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
  .dma_buf_count = 4,
  .dma_buf_len = 1024,
  .use_apll = false,
  .tx_desc_auto_clear = false,
  .fixed_mclk = 0};

// i2s config for reading from left channel of I2S
i2s_config_t i2sMemsConfigLeftChannel = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_I2S),
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0};

// i2s pins
i2s_pin_config_t i2sPins = {
    .bck_io_num = GPIO_NUM_14,
    .ws_io_num = GPIO_NUM_15,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = GPIO_NUM_16};

// how many samples to read at once
const int SAMPLE_SIZE = 16384;

// WiFi/HTTP transport removed; audio uses USB CDC via `sendUsbSamples()` below.

// Send PCM16 samples over USB CDC (Serial) using a small binary frame format:
// Header: 'AUD0' (4 bytes), format uint16 (1=PCM16), sample_rate uint32, sample_count uint32
// Payload: sample_count * int16_t samples (little-endian)
void sendUsbSamples(int16_t *samples, uint32_t sampleCount, uint32_t sampleRate)
{
  if (!samples || sampleCount == 0)
    return;
  // write header
  Serial.write((const uint8_t *)"AUD0", 4);
  uint16_t format = 1; // PCM16
  Serial.write((const uint8_t *)&format, sizeof(format));
  Serial.write((const uint8_t *)&sampleRate, sizeof(sampleRate));
  Serial.write((const uint8_t *)&sampleCount, sizeof(sampleCount));

  // write payload in small non-blocking chunks to avoid blocking the USB TX
  // buffer and triggering the watchdog. Use availableForWrite() to avoid
  // blocking writes and yield between writes so other RTOS tasks can run.
  const uint8_t *ptr = (const uint8_t *)samples;
  size_t bytesTotal = sampleCount * sizeof(int16_t);
  const size_t CHUNK = 256; // bytes
  size_t sent = 0;
  uint32_t wait_ms = 0;
  while (sent < bytesTotal)
  {
    size_t canWrite = Serial.availableForWrite();
    if (canWrite == 0) {
      // let other tasks run and wait a short while for the buffer to drain
      vTaskDelay(pdMS_TO_TICKS(1));
      wait_ms++;
      if ((wait_ms % 100) == 0) {
        Serial.printf("warning: USB TX blocked for %u ms\n", wait_ms);
      }
      // If blocked for a long time, set a reset hint so the next boot can report it
      if (wait_ms > 5000) {
        // Too long stalled sending to USB. Record a serial warning so the
        // next boot log includes evidence of a prolonged TX stall.
        Serial.println("warning: prolonged USB TX stall detected (>5000 ms)");
      }
      continue;
    }
    size_t toSend = bytesTotal - sent;
    if (toSend > CHUNK)
      toSend = CHUNK;
    if (toSend > canWrite)
      toSend = canWrite;
    Serial.write(ptr + sent, toSend);
    sent += toSend;
    wait_ms = 0;
    // yield to scheduler briefly
    vTaskDelay(0);
  }
}

// Task to write samples from ADC to our server
void adcWriterTask(void *param)
{
  I2SSampler *sampler = (I2SSampler *)param;
  int16_t *samples = (int16_t *)malloc(sizeof(uint16_t) * SAMPLE_SIZE);
  if (!samples)
  {
    Serial.println("Failed to allocate memory for samples");
    return;
  }
  while (true)
  {
    int samples_read = sampler->read(samples, SAMPLE_SIZE);
    // previously sent over HTTP; now stream over USB instead
    if (samples_read > 0) {
      sendUsbSamples(samples, (uint32_t)samples_read, 16000);
    }
  }
}

// Task to write samples to our server
void i2sMemsWriterTask(void *param)
{
  I2SSampler *sampler = (I2SSampler *)param;
  int16_t *samples = (int16_t *)malloc(sizeof(uint16_t) * SAMPLE_SIZE);
  if (!samples)
  {
    Serial.println("Failed to allocate memory for samples");
    return;
  }
  while (true)
  {
    int samples_read = sampler->read(samples, SAMPLE_SIZE);
    if (samples_read > 0) {
      // Stream samples over USB to host
      sendUsbSamples(samples, (uint32_t)samples_read, (uint32_t)i2sMemsConfigLeftChannel.sample_rate);
    }
  }
}

void setup()
{
  Serial.begin(115200);
  delay(2000);
  // Basic boot/crash diagnostics
  Serial.println("Feather ESP32-S3 audio firmware starting");
  // Print reset reason (numeric) to help diagnose why the MCU restarted
  esp_reset_reason_t rr = esp_reset_reason();
  Serial.printf("Reset reason (esp_reset_reason): %d\n", (int)rr);
  // Print chip/heap info to help diagnose memory exhaustion
  esp_chip_info_t chipinfo;
  esp_chip_info(&chipinfo);
  Serial.printf("Chip CPU cores: %d, features: 0x%02x, revision: %d\n", chipinfo.cores, chipinfo.features, chipinfo.revision);
  Serial.printf("Free heap: %u bytes, min free heap: %u bytes\n", ESP.getFreeHeap(), ESP.getMinFreeHeap());
  // Print largest contiguous free block to help detect fragmentation
  size_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_DEFAULT);
  Serial.printf("Largest free heap block: %u bytes\n", (unsigned)largest);
  // enable neopixel power (some boards power the pixel via a GPIO)
  pinMode(NEOPIXEL_POWER_PIN, OUTPUT);
  digitalWrite(NEOPIXEL_POWER_PIN, HIGH);
  // small settle delay for power rail to come up
  delay(10);
  // ensure pixel is off initially
  neopixelWrite(NEOPIXEL_PIN, 0, 0, 0);

  // WiFi and HTTP client functionality removed. Device will operate standalone
  // and stream audio over USB CDC. Indicator LED (GPIO2) retained for compatibility.
  pinMode(2, OUTPUT);

  // input from analog microphones such as the MAX9814 or MAX4466
  // internal analog to digital converter sampling using i2s
  // create our samplers
  // adcSampler = new ADCSampler(ADC_UNIT_1, ADC1_CHANNEL_7, adcI2SConfig);

  // set up the adc sample writer task
  // TaskHandle_t adcWriterTaskHandle;
  // adcSampler->start();
  // xTaskCreatePinnedToCore(adcWriterTask, "ADC Writer Task", 4096, adcSampler, 1, &adcWriterTaskHandle, 1);

  // Direct i2s input from INMP441 or the SPH0645
  i2sSampler = new I2SMEMSSampler(I2S_NUM_0, i2sPins, i2sMemsConfigLeftChannel, false);
  i2sSampler->start();
  // set up the i2s sample writer task
  TaskHandle_t i2sMemsWriterTaskHandle;
  xTaskCreatePinnedToCore(i2sMemsWriterTask, "I2S Writer Task", 4096, i2sSampler, 1, &i2sMemsWriterTaskHandle, 1);

  // create a small task to blink the onboard neopixel so user can see the firmware is running
  auto neopixelBlinkTask = [](void *param) {
    (void)param;
    uint8_t state = 0;
    while (true) {
      switch (state) {
        case 0:
          neopixelWrite(NEOPIXEL_PIN, 100, 0, 115); // purple-ish
          break;
        case 1:
          neopixelWrite(NEOPIXEL_PIN, 0, 100, 0); // green
          break;
        case 2:
          neopixelWrite(NEOPIXEL_PIN, 0, 0, 100); // blue
          break;
        default:
          neopixelWrite(NEOPIXEL_PIN, 0, 0, 0); // off
          break;
      }
      state = (state + 1) % 4;
      vTaskDelay(pdMS_TO_TICKS(500));
    }
  };
  xTaskCreatePinnedToCore(neopixelBlinkTask, "NP Blink", 1024, NULL, 1, NULL, 1);

  // // start sampling from i2s device
}

void loop()
{
  // Provide a visible, slow heartbeat on Serial so it's easy to confirm monitor connection.
  static bool isPurple = true;
  if (isPurple) {
    neopixelWrite(NEOPIXEL_PIN, 100, 0, 115); // purple
    Serial.println("Purple");
  } else {
    neopixelWrite(NEOPIXEL_PIN, 0, 100, 0); // green
    Serial.println("Green");
  }
  isPurple = !isPurple;
  delay(1000);
}