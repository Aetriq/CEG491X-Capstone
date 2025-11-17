#include "I2SMEMSSampler.h"
#include <algorithm>

I2SMEMSSampler::I2SMEMSSampler(
    i2s_port_t i2s_port,
    i2s_pin_config_t &i2s_pins,
    i2s_config_t i2s_config,
    bool fixSPH0645) : I2SSampler(i2s_port, i2s_config)
{
    m_i2sPins = i2s_pins;
    m_fixSPH0645 = fixSPH0645;
}

void I2SMEMSSampler::configureI2S()
{
    if (m_fixSPH0645)
    {
        // NOTE: Direct I2S register tweaks used on other ESP32 chips are
        // not portable to ESP32-S3. The recommended approach is to adjust
        // pin configuration or use the I2S driver settings. Here we skip
        // the low-level register tweak on S3 and rely on driver-level config.
    }

    i2s_set_pin(m_i2sPort, &m_i2sPins);
}

int I2SMEMSSampler::read(int16_t *samples, int count)
{
    int32_t raw_samples[256];
    int sample_index = 0;
    while (count > 0)
    {
        size_t bytes_read = 0;
        i2s_read(m_i2sPort, (void *)raw_samples, sizeof(int32_t) * std::min(count, 256), &bytes_read, portMAX_DELAY);
        int samples_read = bytes_read / sizeof(int32_t);
        for (int i = 0; i < samples_read; i++)
        {
            int32_t raw = raw_samples[i];
            if (m_fixSPH0645)
            {
                // SPH0645 produces 24-bit left-justified data; the old register tweak
                // forced MSB alignment in hardware. On S3 we apply a software shift
                // to recover 16-bit signed samples. Mask low nibble and shift down.
                samples[sample_index] = static_cast<int16_t>((raw & 0xFFFFFFF0) >> 11);
            }
            else
            {
                // Default: assume 32-bit word with useful MSBs; convert to 16-bit
                samples[sample_index] = static_cast<int16_t>(raw >> 16);
            }
            sample_index++;
            count--;
        }
    }
    return sample_index;
}