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
// SD / SPI
#include <SPI.h>
#include <SD.h>

// SD SPI pins (user requested)
#define SPI_SCK_PIN 36
#define SPI_MOSI_PIN 35
#define SPI_MISO_PIN 37
#define SD_CS_PIN 5
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

// how many samples to read at once (reduced to avoid large USB/SD bursts)
const int SAMPLE_SIZE = 4096;

// Ring buffer for SD writer
const int NUM_AUDIO_BUFFERS = 4;
static int16_t *audioBuffers[NUM_AUDIO_BUFFERS] = {0};
static QueueHandle_t freeBufferQueue = NULL;   // holds uint8_t indices
static QueueHandle_t filledBufferQueue = NULL; // holds uint8_t indices

// SD writer state
static const char *SD_FOLDER = "/recordings";

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
  // Use preallocated buffers and a queue to hand off to SD writer
  while (true)
  {
    uint8_t idx = 0;
    // try to get a free buffer index
    if (xQueueReceive(freeBufferQueue, &idx, pdMS_TO_TICKS(50)) != pdTRUE) {
      // no free buffer available: drop this frame to avoid blocking sampling
      int16_t tmp[SAMPLE_SIZE];
      int samples_read = sampler->read(tmp, SAMPLE_SIZE);
      (void)samples_read;
      continue;
    }
    // read directly into the buffer
    int samples_read = sampler->read(audioBuffers[idx], SAMPLE_SIZE);
    if (samples_read > 0) {
      // send index to filled queue for SD writer
      if (xQueueSend(filledBufferQueue, &idx, pdMS_TO_TICKS(10)) != pdTRUE) {
        // failed to enqueue: return buffer to free queue
        xQueueSend(freeBufferQueue, &idx, 0);
      }
    } else {
      // nothing read: return buffer
      xQueueSend(freeBufferQueue, &idx, 0);
    }
    // yield briefly
    vTaskDelay(0);
  }
}


// Helper to write a WAV header placeholder and update later
static void writeWavHeaderPlaceholder(File &f, uint32_t sampleRate, uint16_t bitsPerSample, uint16_t channels)
{
  // RIFF header (44 bytes)
  uint32_t byteRate = sampleRate * channels * (bitsPerSample / 8);
  uint16_t blockAlign = channels * (bitsPerSample / 8);
  // write header with zero sizes for now
  f.seek(0);
  f.write((const uint8_t *)"RIFF", 4);
  uint32_t chunkSize = 36; // placeholder
  f.write((const uint8_t *)&chunkSize, 4);
  f.write((const uint8_t *)"WAVE", 4);
  f.write((const uint8_t *)"fmt ", 4);
  uint32_t subchunk1Size = 16;
  f.write((const uint8_t *)&subchunk1Size, 4);
  uint16_t audioFormat = 1; // PCM
  f.write((const uint8_t *)&audioFormat, 2);
  f.write((const uint8_t *)&channels, 2);
  f.write((const uint8_t *)&sampleRate, 4);
  f.write((const uint8_t *)&byteRate, 4);
  f.write((const uint8_t *)&blockAlign, 2);
  f.write((const uint8_t *)&bitsPerSample, 2);
  f.write((const uint8_t *)"data", 4);
  uint32_t dataSize = 0;
  f.write((const uint8_t *)&dataSize, 4);
}

// SD writer task: consumes filled buffers and appends to WAV file
void sdWriterTask(void *param)
{
  (void)param;
  // create recordings folder if needed
  if (!SD.exists(SD_FOLDER)) {
    SD.mkdir(SD_FOLDER);
  }
  // open a new file with timestamp
  char filename[64];
  uint32_t t = (uint32_t)time(NULL);
  snprintf(filename, sizeof(filename), "%s/rec_%u.wav", SD_FOLDER, t ? t : 0);
  File wf = SD.open(filename, FILE_WRITE);
  if (!wf) {
    Serial.println("Failed to open WAV file for writing on SD");
    vTaskDelete(NULL);
    return;
  }
  // write placeholder header
  writeWavHeaderPlaceholder(wf, i2sMemsConfigLeftChannel.sample_rate, 16, 1);
  uint32_t dataBytes = 0;

  Serial.printf("SD writer started, writing to %s\n", filename);

  while (true) {
    uint8_t idx;
    if (xQueueReceive(filledBufferQueue, &idx, portMAX_DELAY) == pdTRUE) {
      // write buffer to file
      size_t toWrite = SAMPLE_SIZE * sizeof(int16_t);
      size_t written = wf.write((const uint8_t *)audioBuffers[idx], toWrite);
      dataBytes += written;
      // flush periodically to ensure data is committed
      wf.flush();
      // return buffer to free queue
      xQueueSend(freeBufferQueue, &idx, 0);
    }
  }

  // finalize header (unreachable in normal operation)
  // update chunk sizes
  wf.seek(4);
  uint32_t chunkSize = 36 + dataBytes;
  wf.write((const uint8_t *)&chunkSize, 4);
  wf.seek(40);
  wf.write((const uint8_t *)&dataBytes, 4);
  wf.close();
  vTaskDelete(NULL);
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
  // Initialize SPI for SD card (user-specified pins)
  Serial.printf("Initializing SPI: SCK=%d MOSI=%d MISO=%d CS=%d\n", SPI_SCK_PIN, SPI_MOSI_PIN, SPI_MISO_PIN, SD_CS_PIN);
  SPI.begin(SPI_SCK_PIN, SPI_MISO_PIN, SPI_MOSI_PIN);
  delay(10);
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("SD.begin() failed — check wiring and that MOSI is output-capable");
  } else {
    Serial.println("SD mounted OK");
    uint64_t cardSize = (uint64_t)SD.cardSize() / (1024ULL * 1024ULL);
    Serial.printf("SD size ~ %llu MB\n", cardSize);
  }
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
  // Direct i2s input from INMP441 or the SPH0645
  // Temporarily disable I2S sampling and writer tasks for SD testing
#if 0
  i2sSampler = new I2SMEMSSampler(I2S_NUM_0, i2sPins, i2sMemsConfigLeftChannel, false);
  i2sSampler->start();
  // set up the i2s sample writer task
  TaskHandle_t i2sMemsWriterTaskHandle;
  xTaskCreatePinnedToCore(i2sMemsWriterTask, "I2S Writer Task", 4096, i2sSampler, 2, &i2sMemsWriterTaskHandle, 1);

  // allocate buffers and create queues
  freeBufferQueue = xQueueCreate(NUM_AUDIO_BUFFERS, sizeof(uint8_t));
  filledBufferQueue = xQueueCreate(NUM_AUDIO_BUFFERS, sizeof(uint8_t));
  if (!freeBufferQueue || !filledBufferQueue) {
    Serial.println("Failed to create buffer queues");
  } else {
    for (uint8_t i = 0; i < NUM_AUDIO_BUFFERS; ++i) {
      audioBuffers[i] = (int16_t *)malloc(sizeof(int16_t) * SAMPLE_SIZE);
      if (!audioBuffers[i]) {
        Serial.printf("Failed to allocate audio buffer %d\n", i);
      } else {
        xQueueSend(freeBufferQueue, &i, 0);
      }
    }
    // start SD writer task if SD mounted
    if (SD.begin(SD_CS_PIN)) {
      TaskHandle_t sdWriterHandle;
      xTaskCreatePinnedToCore(sdWriterTask, "SD Writer", 8192, NULL, 1, &sdWriterHandle, 1);
    } else {
      Serial.println("SD not mounted; SD writer not started");
    }
  }
#else
  Serial.println("Audio sampling disabled for SD test");
#endif

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