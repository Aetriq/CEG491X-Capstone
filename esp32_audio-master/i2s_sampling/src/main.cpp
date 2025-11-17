#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include "I2SMEMSSampler.h"

// I2S pins for SPH0645
#define I2S_BCLK_PIN  14
#define I2S_WS_PIN    15
#define I2S_DATA_PIN  16

// SD card CS
#define SD_CS_PIN     5

// WAV recording parameters
const uint32_t SAMPLE_RATE = 16000;
#define BITS_PER_SAMPLE  16
#define RECORD_SECONDS   10
#define CHANNELS         1
#define BUFFER_SIZE      512

// I2S configuration for SPH0645
i2s_config_t i2sConfig = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S, // updated for ESP32-S3
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
};

// I2S pin config
i2s_pin_config_t i2sPins = {
    .bck_io_num = GPIO_NUM_14,
    .ws_io_num = GPIO_NUM_15,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = GPIO_NUM_16
};

I2SMEMSSampler *i2sSampler = nullptr;

// WAV header helper
struct WAVHeader {
    char riff[4] = {'R','I','F','F'};
    uint32_t chunkSize;
    char wave[4] = {'W','A','V','E'};
    char fmt[4]  = {'f','m','t',' '};
    uint32_t subchunk1Size = 16;
    uint16_t audioFormat = 1;  // PCM
    uint16_t numChannels = CHANNELS;
    uint32_t sampleRate = SAMPLE_RATE;
    uint32_t byteRate;
    uint16_t blockAlign;
    uint16_t bitsPerSample = BITS_PER_SAMPLE;
    char data[4] = {'d','a','t','a'};
    uint32_t subchunk2Size;
};

void writeWAVHeader(File &file, uint32_t numSamples) {
    WAVHeader header;
    header.numChannels = CHANNELS;
    header.sampleRate = SAMPLE_RATE;
    header.bitsPerSample = BITS_PER_SAMPLE;
    header.byteRate = SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8;
    header.blockAlign = CHANNELS * BITS_PER_SAMPLE / 8;
    header.subchunk2Size = numSamples * CHANNELS * BITS_PER_SAMPLE / 8;
    header.chunkSize = 36 + header.subchunk2Size;
    file.seek(0);
    file.write((uint8_t*)&header, sizeof(header));
}

// Send WAV over Serial in "AUD0" format
void streamWAVOverSerial(File &file, uint32_t numSamples) {
    // Send header
    Serial.write((const uint8_t *)"AUD0", 4);
    uint16_t format = 1; // PCM16
    Serial.write((uint8_t*)&format, sizeof(format));
    Serial.write((uint8_t*)&SAMPLE_RATE, sizeof(SAMPLE_RATE));
    Serial.write((uint8_t*)&numSamples, sizeof(numSamples));

    // Send payload in chunks
    uint8_t buffer[BUFFER_SIZE * 2]; // 16-bit samples
    file.seek(sizeof(WAVHeader));
    uint32_t samplesSent = 0;
    while (samplesSent < numSamples) {
        uint32_t toRead = min((uint32_t)BUFFER_SIZE, numSamples - samplesSent);
        file.read(buffer, toRead * 2);
        Serial.write(buffer, toRead * 2);
        Serial.flush();
        samplesSent += toRead;
        delay(0); // yield
    }
}

void setup() {
    Serial.begin(115200);
    delay(2000);
    // Serial.println("ESP32-S3 WAV recorder starting...");

    // Initialize SD
    if (!SD.begin(SD_CS_PIN)) {
      //  Serial.println("SD.begin failed!");
        while (true) delay(1000);
    }

    // Initialize I2S
    i2sSampler = new I2SMEMSSampler(I2S_NUM_0, i2sPins, i2sConfig, false);
    i2sSampler->start();

    // Prepare WAV file
    File wavFile = SD.open("/recording.wav", FILE_WRITE);
    if (!wavFile) {
        //Serial.println("Failed to open WAV file on SD");
        while (true) delay(1000);
    }

    // Reserve space for header
    wavFile.seek(sizeof(WAVHeader));

    // Allocate buffer
    int16_t buffer[BUFFER_SIZE];

    // Total samples to record
    uint32_t totalSamples = SAMPLE_RATE * RECORD_SECONDS;
    uint32_t samplesWritten = 0;

    //Serial.println("Recording...");
    while (samplesWritten < totalSamples) {
        uint32_t samplesToRead = min((uint32_t)BUFFER_SIZE, totalSamples - samplesWritten);
        uint32_t readCount = i2sSampler->read(buffer, samplesToRead);
        wavFile.write((uint8_t*)buffer, readCount * sizeof(int16_t));
        samplesWritten += readCount;
    }

    // Write WAV header now that we know total samples
    writeWAVHeader(wavFile, samplesWritten);
    wavFile.close();

    //Serial.println("Recording finished. File saved to SD: /recording.wav");
    //Serial.println("Streaming WAV over USB...");

    // Reopen file for streaming
    wavFile = SD.open("/recording.wav", FILE_READ);
    if (wavFile) {
        streamWAVOverSerial(wavFile, totalSamples);
        wavFile.close();
        //Serial.println("Streaming complete.");
    } else {
        //Serial.println("Failed to reopen WAV file for streaming.");
    }
}

void loop() {
    // Nothing to do
}
