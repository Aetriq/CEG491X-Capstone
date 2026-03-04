/* Configuration Manager Implementation */
#include "config_manager.h"
#include "nvs_flash.h"
#include "nvs.h"

#define NVS_NAMESPACE "echolog_cfg"
#define NVS_KEY "dev_cfg"

void load_config(device_config_t *cfg) {
    nvs_handle_t my_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &my_handle);
    
    /* Set defaults if NVS is uninitialized or struct size mismatches */
    cfg->accel_act_thresh = 1800;
    cfg->accel_act_time = 10;
    cfg->accel_inact_thresh = 1500;
    cfg->accel_inact_time = 10;
    cfg->record_length_sec = 30;

    if (err == ESP_OK) {
        size_t required_size = 0;
        
        /* First pass: Get the actual size of the stored blob by passing NULL */
        nvs_get_blob(my_handle, NVS_KEY, NULL, &required_size);

        /* Second pass: Only load if the stored blob exactly matches our new struct size */
        if (required_size == sizeof(device_config_t)) {
            nvs_get_blob(my_handle, NVS_KEY, cfg, &required_size);
        }
        
        nvs_close(my_handle);
    }
}

void save_config(device_config_t *cfg) {
    nvs_handle_t my_handle;
    if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &my_handle) == ESP_OK) {
        nvs_set_blob(my_handle, NVS_KEY, cfg, sizeof(device_config_t));
        nvs_commit(my_handle);
        nvs_close(my_handle);
    }
}