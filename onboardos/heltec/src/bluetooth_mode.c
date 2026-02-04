/**
* ////////////////////////////////////////////////////////////////////
* // _____     _           _                  ____ _____ ___  ____  //
* //| ____|___| |__   ___ | |    ___   __ _  |  _ \_   _/ _ \/ ___| //
* //|  _| / __| '_ \ / _ \| |   / _ \ / _` | | |_) || || | | \___ \ //
* //| |__| (__| | | | (_) | |__| (_) | (_| | |  _ < | || |_| |___) |//
* //|_____\___|_| |_|\___/|_____\___/ \__, | |_| \_\|_| \___/|____/ //
* //                                  |___/                         //
* ////////////////////////////////////////////////////////////////////
*/

/* Team EchoLog (Group 2) */
/* CEG4912/3 Capstone Project */
/* School of Electrical Engineering and Computer Science at the University of Ottawa */

/* Onboard OS for ESP32-S3 based Heltec IOT Wireless Tracker */
/* Bluetooth Mode */

/* ========== HARDWARE OVERVIEW ========== 
 * BLE Module: ESP32-S3 built-in
 * BT 4.2 Mode (Temporary, move to 5.0) 
 *
 * Storage: MicroSD card breakout board+ by Adafruit Technologies 
 * SPI Mode 
 * Stores all tracking/audio data
 *
 * Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
 * 0.0 Premable
 * 1.0 Headers
 * 2.0 Pin mappings
 * 3.0 Definitions
 *  3.5 Public & Static Variables
 * 4.0 Functions
 * 5.0 Main Method 
 */

/* ==================== 1.0 Headers ====================  */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/unistd.h>
#include <sys/stat.h>
#include <dirent.h>
#include <errno.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "freertos/queue.h"

#include "esp_system.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_bt.h"
#include "esp_sleep.h"
#include "esp_timer.h"

#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"
#include "esp_bt_defs.h"
#include "esp_bt_main.h"
#include "esp_gatt_common_api.h"

#include "driver/gpio.h"
#include "driver/sdspi_host.h"
#include "driver/spi_common.h"
#include "driver/spi_master.h"

#include "esp_vfs_fat.h"
#include "sdmmc_cmd.h"
#include "rtc_module.h"

/* ==================== 2.0 Pin Mappings ==================== */

#define SD_PIN_NUM_MISO      GPIO_NUM_26
#define SD_PIN_NUM_MOSI      GPIO_NUM_17
#define SD_PIN_NUM_CLK       GPIO_NUM_16
#define SD_PIN_NUM_CS        GPIO_NUM_15

#define GPIO_BT_LED          GPIO_NUM_35
#define PIN_MODE_BT          GPIO_NUM_0

/* ==================== 3.0 Global Definitions & Variables ==================== */

#define MOUNT_POINT          "/sdcard"

static const uint8_t service_uuid[16] = { 0x4b, 0x91, 0x31, 0xc3, 0xc9, 0xc5, 0xcc, 0x8f, 0x9e, 0x45, 0xb5, 0x1f, 0x01, 0xc2, 0xaf, 0x4f };
static const uint8_t char_cmd_uuid[16] = { 0xa8, 0x26, 0x1b, 0x36, 0x07, 0xea, 0xf5, 0xb7, 0x88, 0x46, 0xe1, 0x36, 0x3e, 0x48, 0xb5, 0xbe };
static const uint8_t char_data_uuid[16] = { 0x3b, 0x70, 0x7c, 0x68, 0xb9, 0x70, 0x42, 0x94, 0x22, 0x4c, 0xc4, 0x03, 0x7c, 0x28, 0x9a, 0x82 };
static const uint8_t char_upload_uuid[16] = { 0x0f, 0x41, 0xb3, 0x04, 0x10, 0x00, 0x20, 0x81, 0x03, 0x49, 0x83, 0x58, 0x12, 0x1b, 0x2e, 0xce };

enum {
    IDX_SVC, IDX_CHAR_CMD, IDX_CHAR_VAL_CMD, IDX_CHAR_DATA, IDX_CHAR_VAL_DATA, IDX_CHAR_CFG_DATA, IDX_CHAR_UPLOAD, IDX_CHAR_VAL_UPLOAD, HRS_IDX_NB,
};

static uint16_t conn_id = 0;
static esp_gatt_if_t gatts_if_handle = 0;
static bool device_connected = false;
static uint16_t echo_handle_table[HRS_IDX_NB];

FILE *transfer_file = NULL;
bool is_downloading = false;
bool is_uploading = false;
char pending_cmd[128] = {0};
bool cmd_ready = false;

#define TRANSFER_BLOCK_SIZE 490

static sdmmc_card_t *card;

/* ==================== 4.0 Bluetooth & SD Functions ==================== */

esp_err_t send_notification(uint8_t *data, size_t len) {
    if (device_connected) {
        return esp_ble_gatts_send_indicate(gatts_if_handle, conn_id, echo_handle_table[IDX_CHAR_VAL_DATA], len, data, false);
    }
    return ESP_FAIL;
}

void send_eof() {
    send_notification((uint8_t*)"EOF", 3);
}

void mount_sd_ble() {
    esp_vfs_fat_sdmmc_mount_config_t mount_config = { .format_if_mount_failed = false, .max_files = 5, .allocation_unit_size = 16 * 1024 };
    sdmmc_host_t host = SDSPI_HOST_DEFAULT();
    host.slot = SPI2_HOST;
    spi_bus_config_t bus_cfg = { .mosi_io_num = SD_PIN_NUM_MOSI, .miso_io_num = SD_PIN_NUM_MISO, .sclk_io_num = SD_PIN_NUM_CLK, .quadwp_io_num = -1, .quadhd_io_num = -1, .max_transfer_sz = 4000 };
    spi_bus_initialize(host.slot, &bus_cfg, SPI_DMA_CH_AUTO);
    sdspi_device_config_t slot_config = SDSPI_DEVICE_CONFIG_DEFAULT();
    slot_config.gpio_cs = SD_PIN_NUM_CS;
    slot_config.host_id = host.slot;
    esp_vfs_fat_sdspi_mount(MOUNT_POINT, &host, &slot_config, &mount_config, &card);
}

void process_command_task(void *pvParameters) {
    uint8_t *fileBuf = malloc(TRANSFER_BLOCK_SIZE);
    char filepath[300];

    while (1) {
        if (cmd_ready) {
            if (strcmp(pending_cmd, "ls") == 0) {
                DIR *dir = opendir(MOUNT_POINT);
                if (dir) {
                    struct dirent *entry;
                    while ((entry = readdir(dir)) != NULL) {
                        if (entry->d_type == DT_REG) {
                            snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, entry->d_name);
                            struct stat st;
                            if (stat(filepath, &st) == 0) {
                                char line[300];
                                int len = snprintf(line, sizeof(line), "%s|%ld", entry->d_name, st.st_size);
                                send_notification((uint8_t*)line, len);
                                vTaskDelay(pdMS_TO_TICKS(20));
                            }
                        }
                    }
                    closedir(dir);
                }
                send_eof();
            }
            else if (strncmp(pending_cmd, "get ", 4) == 0) {
                char *fname = pending_cmd + 4;
                snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, (fname[0]=='/')?fname+1:fname);
                if(transfer_file) fclose(transfer_file);
                transfer_file = fopen(filepath, "rb");
                if(transfer_file) is_downloading = true;
                else send_eof();
            }
            else if (strncmp(pending_cmd, "time ", 5) == 0) {
                int y, m, d, hh, mm, ss;
                if (sscanf(pending_cmd + 5, "%d %d %d %d %d %d", &y, &m, &d, &hh, &mm, &ss) == 6) {
                    rtc_set_time_manual(y, m, d, hh, mm, ss);
                    
                    char reply[20];
                    int len = snprintf(reply, sizeof(reply), "SET:%04d%02d%02d", y, m, d);
                    send_notification((uint8_t*)reply, len);
                } else {
                    send_notification((uint8_t*)"TIME_ERR", 8);
                }
                send_eof();
            }
            else if (strncmp(pending_cmd, "upload ", 7) == 0) {
                char *fname = pending_cmd + 7;
                snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, (fname[0]=='/')?fname+1:fname);
                if(transfer_file) fclose(transfer_file);
                unlink(filepath);
                transfer_file = fopen(filepath, "wb");
                if(transfer_file) { is_uploading = true; send_notification((uint8_t*)"READY", 5); }
                else { send_notification((uint8_t*)"ERROR", 5); }
            }
            else if (strcmp(pending_cmd, "end_upload") == 0) {
                if(transfer_file) { fclose(transfer_file); transfer_file = NULL; }
                is_uploading = false;
                send_eof();
            }
            cmd_ready = false;
        }

        if (is_downloading && device_connected && transfer_file) {
            int len = fread(fileBuf, 1, TRANSFER_BLOCK_SIZE, transfer_file);
            if (len > 0) {
                esp_err_t err = send_notification(fileBuf, len);

                if (err == ESP_FAIL || err == ESP_ERR_NO_MEM) {
                    fseek(transfer_file, -len, SEEK_CUR);
                    vTaskDelay(1);
                }
            } else {
                fclose(transfer_file); transfer_file = NULL;
                is_downloading = false;
                send_eof();
            }
        } else {
            vTaskDelay(pdMS_TO_TICKS(10));
        }
    }
}

static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) {
    if (event == ESP_GAP_BLE_ADV_DATA_SET_COMPLETE_EVT) {
        esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){
            .adv_int_min = 0x20, .adv_int_max = 0x40,
            .adv_type = ADV_TYPE_IND, .own_addr_type = BLE_ADDR_TYPE_PUBLIC,
            .channel_map = ADV_CHNL_ALL, .adv_filter_policy = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY
        });
    }
}

static void gatts_event_handler(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if, esp_ble_gatts_cb_param_t *param) {
    switch (event) {
    case ESP_GATTS_REG_EVT: {
        gatts_if_handle = gatts_if;
        esp_ble_gap_set_device_name("EchoLog");

        esp_ble_gap_config_adv_data(&(esp_ble_adv_data_t){
            .set_scan_rsp = false, .include_name = true, .include_txpower = false,
            .min_interval = 0x0006, .max_interval = 0x0010,
            .appearance = 0x00, .manufacturer_len = 0, .p_manufacturer_data = NULL,
            .service_data_len = 0, .p_service_data = NULL, .service_uuid_len = 16, .p_service_uuid = (uint8_t*)service_uuid,
            .flag = (ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT)
        });

        static const uint16_t primary_service_uuid = ESP_GATT_UUID_PRI_SERVICE;
        static const uint16_t character_declaration_uuid = ESP_GATT_UUID_CHAR_DECLARE;
        static const uint16_t character_client_config_uuid = ESP_GATT_UUID_CHAR_CLIENT_CONFIG;
        static const uint8_t char_prop_write = ESP_GATT_CHAR_PROP_BIT_WRITE;
        static const uint8_t char_prop_read_notify = ESP_GATT_CHAR_PROP_BIT_READ | ESP_GATT_CHAR_PROP_BIT_NOTIFY;
        static const uint8_t ccc_value[2] = {0x00, 0x00};

        const esp_gatts_attr_db_t gatt_db[HRS_IDX_NB] = {
            [IDX_SVC] = { {ESP_GATT_AUTO_RSP}, {ESP_UUID_LEN_16, (uint8_t *)&primary_service_uuid, ESP_GATT_PERM_READ, 16, 16, (uint8_t *)service_uuid} },
            [IDX_CHAR_CMD] = { {ESP_GATT_AUTO_RSP}, {ESP_UUID_LEN_16, (uint8_t *)&character_declaration_uuid, ESP_GATT_PERM_READ, 1, 1, (uint8_t *)&char_prop_write} },
            [IDX_CHAR_VAL_CMD] = { {ESP_GATT_AUTO_RSP}, {ESP_UUID_LEN_128, (uint8_t *)char_cmd_uuid, ESP_GATT_PERM_WRITE, 200, 0, NULL} },
            [IDX_CHAR_DATA] = { {ESP_GATT_AUTO_RSP}, {ESP_UUID_LEN_16, (uint8_t *)&character_declaration_uuid, ESP_GATT_PERM_READ, 1, 1, (uint8_t *)&char_prop_read_notify} },
            [IDX_CHAR_VAL_DATA] = { {ESP_GATT_AUTO_RSP}, {ESP_UUID_LEN_128, (uint8_t *)char_data_uuid, ESP_GATT_PERM_READ, 200, 0, NULL} },
            [IDX_CHAR_CFG_DATA] = { {ESP_GATT_AUTO_RSP}, {ESP_UUID_LEN_16, (uint8_t *)&character_client_config_uuid, ESP_GATT_PERM_READ | ESP_GATT_PERM_WRITE, 2, 2, (uint8_t *)ccc_value} },
            [IDX_CHAR_UPLOAD] = { {ESP_GATT_AUTO_RSP}, {ESP_UUID_LEN_16, (uint8_t *)&character_declaration_uuid, ESP_GATT_PERM_READ, 1, 1, (uint8_t *)&char_prop_write} },
            [IDX_CHAR_VAL_UPLOAD] = { {ESP_GATT_AUTO_RSP}, {ESP_UUID_LEN_128, (uint8_t *)char_upload_uuid, ESP_GATT_PERM_WRITE, 512, 0, NULL} },
        };
        esp_ble_gatts_create_attr_tab(gatt_db, gatts_if, HRS_IDX_NB, 0);
        break;
    }

    case ESP_GATTS_CREAT_ATTR_TAB_EVT:
        if (param->add_attr_tab.status == ESP_GATT_OK) {
            memcpy(echo_handle_table, param->add_attr_tab.handles, sizeof(echo_handle_table));
            esp_ble_gatts_start_service(echo_handle_table[IDX_SVC]);
        }
        break;

    case ESP_GATTS_CONNECT_EVT:
        conn_id = param->connect.conn_id;
        device_connected = true;
        gpio_set_level(GPIO_BT_LED, 1);
        esp_ble_conn_update_params_t conn_params = {0};

        memcpy(conn_params.bda, param->connect.remote_bda, sizeof(esp_bd_addr_t));

        conn_params.min_int = 0x06;
        conn_params.max_int = 0x0C;
        conn_params.latency = 0;
        conn_params.timeout = 400;

        esp_ble_gap_update_conn_params(&conn_params);

        esp_ble_gatt_set_local_mtu(517);
        break;

    case ESP_GATTS_DISCONNECT_EVT:
        device_connected = false;
        is_downloading = false;
        gpio_set_level(GPIO_BT_LED, 0);

        if(transfer_file) { fclose(transfer_file); transfer_file = NULL; }
        esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){
            .adv_int_min = 0x20, .adv_int_max = 0x40,
            .adv_type = ADV_TYPE_IND, .own_addr_type = BLE_ADDR_TYPE_PUBLIC,
            .channel_map = ADV_CHNL_ALL, .adv_filter_policy = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY
        });
        break;

    case ESP_GATTS_WRITE_EVT:
        if (param->write.handle == echo_handle_table[IDX_CHAR_VAL_CMD]) {
            int len = (param->write.len < sizeof(pending_cmd)-1) ? param->write.len : sizeof(pending_cmd)-1;
            memcpy(pending_cmd, param->write.value, len);
            pending_cmd[len] = 0;
            cmd_ready = true;
        }
        else if (param->write.handle == echo_handle_table[IDX_CHAR_VAL_UPLOAD]) {
             if (is_uploading && transfer_file) fwrite(param->write.value, 1, param->write.len, transfer_file);
        }
        if (param->write.need_rsp) esp_ble_gatts_send_response(gatts_if, param->write.conn_id, param->write.trans_id, ESP_GATT_OK, NULL);
        break;
    default: break;
    }
}

/* ==================== 5.0 Main ==================== */

void bluetooth_mode_main(void) {
    esp_log_level_set("*", ESP_LOG_NONE);

    // Hardware Init
    gpio_reset_pin(GPIO_BT_LED);
    gpio_set_direction(GPIO_BT_LED, GPIO_MODE_OUTPUT);
    gpio_set_level(GPIO_BT_LED, 0);

    // Re-init NVS/SD/BT only if not already active (simplified for this context)
    // Note: repeatedly initing/deiniting BT stack can be tricky in ESP-IDF.
    // For stability, we often just leave BT on, but here is the full cycle logic:
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    mount_sd_ble();

    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    esp_bt_controller_init(&bt_cfg);
    esp_bt_controller_enable(ESP_BT_MODE_BLE);
    esp_bluedroid_init();
    esp_bluedroid_enable();

    esp_ble_gatts_register_callback(gatts_event_handler);
    esp_ble_gap_register_callback(gap_event_handler);
    esp_ble_gatts_app_register(0);

    TaskHandle_t taskHandle = NULL;
    xTaskCreate(process_command_task, "sd_task", 4096 * 2, NULL, 5, &taskHandle);

    // --- SUPERVISOR LOOP ---
    // Stay here ONLY while the switch is still in BT position
    while (gpio_get_level(PIN_MODE_BT) == 0) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }

    // --- GRACEFUL SHUTDOWN ---
    // 1. Stop the logic task
    if(taskHandle != NULL) vTaskDelete(taskHandle);

    // 2. Close any open files
    if(transfer_file) { fclose(transfer_file); transfer_file = NULL; }

    // 3. Unmount SD
    esp_vfs_fat_sdcard_unmount(MOUNT_POINT, card);
    spi_bus_free(SPI2_HOST); // Free bus so Recording Mode can use it

    // 4. Deinit Bluetooth (Critical to free memory for Recording Mode)
    esp_bluedroid_disable();
    esp_bluedroid_deinit();
    esp_bt_controller_disable();
    esp_bt_controller_deinit();

    gpio_set_level(GPIO_BT_LED, 0);
}