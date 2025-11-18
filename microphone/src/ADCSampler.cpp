#include "ADCSampler.h"
#include <driver/adc.h>

ADCSampler::ADCSampler(adc_unit_t adcUnit, adc1_channel_t adcChannel, const i2s_config_t &i2s_config) : I2SSampler(I2S_NUM_0, i2s_config)
{
    m_adcUnit = adcUnit;
    m_adcChannel = adcChannel;
}

void ADCSampler::configureI2S()
{
    // Configure ADC1 width and attenuation for the selected channel.
    // This prepares the ADC for raw reads via adc1_get_raw().
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(m_adcChannel, ADC_ATTEN_DB_11);
}

void ADCSampler::unConfigureI2S()
{
    // Nothing special to do for adc1_get_raw(); leave ADC configured.
}

int ADCSampler::read(int16_t *samples, int count)
{
    // Simple blocking read using adc1_get_raw for each sample.
    // This is not DMA/ISR driven but works for basic sampling on the S3.
    for (int i = 0; i < count; ++i)
    {
        int raw = adc1_get_raw(m_adcChannel); // 0..4095 for 12-bit
        // Convert unsigned 12-bit (0..4095) to signed centered around 0
        int centered = raw - 2048;
        // Scale to int16 range (approx)
        int val = centered * 16; // 12-bit -> 16-bit scaling
        if (val > INT16_MAX)
            val = INT16_MAX;
        if (val < INT16_MIN)
            val = INT16_MIN;
        samples[i] = static_cast<int16_t>(val);
    }
    return count;
}
