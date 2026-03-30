/*
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│    _______   ________  ___  ___  ________  ___       ________  ________          ________  _________  ________  ________         │
│   |\  ___ \ |\   ____\|\  \|\  \|\   __  \|\  \     |\   __  \|\   ____\        |\   __  \|\___   ___\\   __  \|\   ____\        │
│   \ \   __/|\ \  \___|\ \  \\\  \ \  \|\  \ \  \    \ \  \|\  \ \  \___|        \ \  \|\  \|___ \  \_\ \  \|\  \ \  \___|_       │
│    \ \  \_|/_\ \  \    \ \   __  \ \  \\\  \ \  \    \ \  \\\  \ \  \  ___       \ \   _  _\   \ \  \ \ \  \\\  \ \_____  \      │
│     \ \  \_|\ \ \  \____\ \  \ \  \ \  \\\  \ \  \____\ \  \\\  \ \  \|\  \       \ \  \\  \|   \ \  \ \ \  \\\  \|____|\  \     │
│      \ \_______\ \_______\ \__\ \__\ \_______\ \_______\ \_______\ \_______\       \ \__\\ _\    \ \__\ \ \_______\____\_\  \    │
│       \|_______|\|_______|\|__|\|__|\|_______|\|_______|\|_______|\|_______|        \|__|\|__|    \|__|  \|_______|\_________\   │
│                                                                                                                   \|_________|   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
*/

/* Team EchoLog (Group 2) */
/* CEG4912/3 Capstone Project */
/* School of Electrical Engineering and Computer Science at the University of Ottawa */

/* Onboard OS for ESP32-S3 based ESP-32 S3 Supermini */
/* Bluetooth Mode GATT Server & Command Processing */

/* Author(s): Gordon, A., Spacek, A., Liu, M., Nyannak, D., Escalante, A. */

/* ========== TABLE OF CONTENTS ========== 
   1.0 Includes & Definitions
   2.0 Variables
   3.0 BLE & Notification Methods
   4.0 Command Processing Task
   5.0 Bluetooth Setup & Main
========================================*/

/* ==================== 1.0 Includes & Definitions ==================== */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <dirent.h>
#include <sys/stat.h>
#include <sys/time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_bt.h"
#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"
#include "esp_bt_main.h"
#include "esp_gatt_common_api.h"
#include "driver/sdspi_host.h"
#include "esp_vfs_fat.h"
#include "globals.h"
#include "rtc_module.h"
#include "config_manager.h"
#include "self_test.h"
#include "gps_module.h"

#define MOUNT_POINT "/sdcard"
#define TRANSFER_BLOCK_SIZE 490

/* ==================== 2.0 Variables ==================== */
static const uint8_t service_uuid[16] = {0x4b,0x91,0x31,0xc3,0xc9,0xc5,0xcc,0x8f,0x9e,0x45,0xb5,0x1f,0x01,0xc2,0xaf,0x4f};
static const uint8_t char_cmd_uuid[16] = {0xa8,0x26,0x1b,0x36,0x07,0xea,0xf5,0xb7,0x88,0x46,0xe1,0x36,0x3e,0x48,0xb5,0xbe};
static const uint8_t char_data_uuid[16] = {0x3b,0x70,0x7c,0x68,0xb9,0x70,0x42,0x94,0x22,0x4c,0xc4,0x03,0x7c,0x28,0x9a,0x82};
static const uint8_t char_upload_uuid[16] = {0x0f,0x41,0xb3,0x04,0x10,0x00,0x20,0x81,0x03,0x49,0x83,0x58,0x12,0x1b,0x2e,0xce};
enum { IDX_SVC, IDX_CHAR_CMD, IDX_CHAR_VAL_CMD, IDX_CHAR_DATA, IDX_CHAR_VAL_DATA, IDX_CHAR_CFG_DATA, IDX_CHAR_UPLOAD, IDX_CHAR_VAL_UPLOAD, HRS_IDX_NB };

typedef struct { uint16_t len; uint8_t data[512]; } up_chunk_t;
QueueHandle_t up_queue = NULL;

static uint16_t conn_id = 0, echo_handle_table[HRS_IDX_NB];
static esp_gatt_if_t gatts_if_handle = 0;
static bool device_connected = false, is_downloading = false, is_uploading = false, cmd_ready = false;
FILE *transfer_file = NULL;
char pending_cmd[128] = {0};
static sdmmc_card_t *card = NULL;

/* ==================== 3.0 BLE & Notification Methods ==================== */
static void park_cs_pins() { gpio_set_direction(SD_PIN_NUM_CS, GPIO_MODE_OUTPUT); gpio_set_level(SD_PIN_NUM_CS, 1); gpio_set_direction(ADXL_PIN_NUM_CS, GPIO_MODE_OUTPUT); gpio_set_level(ADXL_PIN_NUM_CS, 1); }

esp_err_t send_notification(uint8_t *data, size_t len) {
    if(device_connected) return esp_ble_gatts_send_indicate(gatts_if_handle, conn_id, echo_handle_table[IDX_CHAR_VAL_DATA], len, data, false);
    return ESP_FAIL;
}

void send_eof() { 
    while(send_notification((uint8_t*)"EOF", 3) != ESP_OK && device_connected) { 
        vTaskDelay(pdMS_TO_TICKS(20)); 
    } 
}

static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) {
    if(event == ESP_GAP_BLE_ADV_DATA_SET_COMPLETE_EVT) esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){.adv_int_min=0x20, .adv_int_max=0x40, .adv_type=ADV_TYPE_IND, .own_addr_type=BLE_ADDR_TYPE_PUBLIC, .channel_map=ADV_CHNL_ALL, .adv_filter_policy=ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY});
}

static void gatts_event_handler(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if, esp_ble_gatts_cb_param_t *param) {
    switch(event) {
        case ESP_GATTS_REG_EVT: {
            gatts_if_handle = gatts_if; esp_ble_gap_set_device_name("EchoLog");
            esp_ble_gap_config_adv_data(&(esp_ble_adv_data_t){.set_scan_rsp=false, .include_name=true, .include_txpower=false, .min_interval=0x0006, .max_interval=0x0010, .appearance=0x00, .service_uuid_len=16, .p_service_uuid=(uint8_t*)service_uuid, .flag=(ESP_BLE_ADV_FLAG_GEN_DISC|ESP_BLE_ADV_FLAG_BREDR_NOT_SPT)});
            static const uint16_t primary_service_uuid=ESP_GATT_UUID_PRI_SERVICE, character_declaration_uuid=ESP_GATT_UUID_CHAR_DECLARE, character_client_config_uuid=ESP_GATT_UUID_CHAR_CLIENT_CONFIG;
            static const uint8_t char_prop_write=ESP_GATT_CHAR_PROP_BIT_WRITE, char_prop_read_notify=ESP_GATT_CHAR_PROP_BIT_READ|ESP_GATT_CHAR_PROP_BIT_NOTIFY, ccc_value[2]={0x00, 0x00};
            const esp_gatts_attr_db_t gatt_db[HRS_IDX_NB] = {
                [IDX_SVC]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&primary_service_uuid,ESP_GATT_PERM_READ,16,16,(uint8_t*)service_uuid}},
                [IDX_CHAR_CMD]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&character_declaration_uuid,ESP_GATT_PERM_READ,1,1,(uint8_t*)&char_prop_write}},
                [IDX_CHAR_VAL_CMD]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_128,(uint8_t*)char_cmd_uuid,ESP_GATT_PERM_WRITE,200,0,NULL}},
                [IDX_CHAR_DATA]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&character_declaration_uuid,ESP_GATT_PERM_READ,1,1,(uint8_t*)&char_prop_read_notify}},
                [IDX_CHAR_VAL_DATA]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_128,(uint8_t*)char_data_uuid,ESP_GATT_PERM_READ,200,0,NULL}},
                [IDX_CHAR_CFG_DATA]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&character_client_config_uuid,ESP_GATT_PERM_READ|ESP_GATT_PERM_WRITE,2,2,(uint8_t*)ccc_value}},
                [IDX_CHAR_UPLOAD]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_16,(uint8_t*)&character_declaration_uuid,ESP_GATT_PERM_READ,1,1,(uint8_t*)&char_prop_write}},
                [IDX_CHAR_VAL_UPLOAD]={{ESP_GATT_AUTO_RSP},{ESP_UUID_LEN_128,(uint8_t*)char_upload_uuid,ESP_GATT_PERM_WRITE,512,0,NULL}},
            };
            esp_ble_gatts_create_attr_tab(gatt_db, gatts_if, HRS_IDX_NB, 0); break;
        }
        case ESP_GATTS_CREAT_ATTR_TAB_EVT: memcpy(echo_handle_table, param->add_attr_tab.handles, sizeof(echo_handle_table)); esp_ble_gatts_start_service(echo_handle_table[IDX_SVC]); break;
        case ESP_GATTS_CONNECT_EVT: {
            conn_id=param->connect.conn_id; device_connected=true; sys_led_state = LED_BT_PAIRED;
            esp_ble_conn_update_params_t conn_params={0}; memcpy(conn_params.bda, param->connect.remote_bda, sizeof(esp_bd_addr_t)); 
            conn_params.min_int=0x0C; conn_params.max_int=0x18; conn_params.latency=0; conn_params.timeout=400;
            esp_ble_gap_update_conn_params(&conn_params); esp_ble_gatt_set_local_mtu(517); break;
        }
        case ESP_GATTS_DISCONNECT_EVT:
            device_connected=false; is_downloading=false; sys_led_state = LED_BT_DISCONNECTING;
            if(transfer_file) { fclose(transfer_file); transfer_file=NULL; }
            esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){.adv_int_min=0x20, .adv_int_max=0x40, .adv_type=ADV_TYPE_IND, .own_addr_type=BLE_ADDR_TYPE_PUBLIC, .channel_map=ADV_CHNL_ALL, .adv_filter_policy=ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY}); break;
        case ESP_GATTS_WRITE_EVT:
            if(param->write.handle==echo_handle_table[IDX_CHAR_VAL_CMD]) { int len=(param->write.len<sizeof(pending_cmd)-1)?param->write.len:sizeof(pending_cmd)-1; memcpy(pending_cmd, param->write.value, len); pending_cmd[len]=0; cmd_ready=true; }
            else if(param->write.handle==echo_handle_table[IDX_CHAR_VAL_UPLOAD]) { if(is_uploading && up_queue) { up_chunk_t chk; chk.len = param->write.len; memcpy(chk.data, param->write.value, chk.len); xQueueSendFromISR(up_queue, &chk, NULL); } }
            if(param->write.need_rsp) { esp_ble_gatts_send_response(gatts_if, param->write.conn_id, param->write.trans_id, ESP_GATT_OK, NULL); } break;
        default: break;
    }
}

/* ==================== 4.0 Command Processing Task ==================== */
void process_command_task(void *pvParameters) {
    uint8_t *fileBuf = malloc(TRANSFER_BLOCK_SIZE); char filepath[300]; int dl_len = 0; up_chunk_t chk;
    
    while(get_system_mode() == MODE_BLUETOOTH) {
        if(cmd_ready) {
            if(!strcmp(pending_cmd, "ls")) { DIR *dir = opendir(MOUNT_POINT); if(dir) { struct dirent *entry; while((entry=readdir(dir))) { if(entry->d_type==DT_REG) { snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, entry->d_name); struct stat st; if(!stat(filepath, &st)) { char line[300]; int len=snprintf(line, sizeof(line), "%s|%ld", entry->d_name, st.st_size); send_notification((uint8_t*)line, len); vTaskDelay(pdMS_TO_TICKS(20)); } } } closedir(dir); } send_eof(); }
            else if(!strncmp(pending_cmd, "get ", 4)) { char *fname = pending_cmd+4; snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, (fname[0]=='/')?fname+1:fname); if(transfer_file) { fclose(transfer_file); } transfer_file = fopen(filepath, "rb"); if(transfer_file) { is_downloading = true; dl_len = 0; } else { send_eof(); } }
            else if(!strncmp(pending_cmd, "upload ", 7)) { char *fname = pending_cmd+7; snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, (fname[0]=='/')?fname+1:fname); if(transfer_file) { fclose(transfer_file); } remove(filepath); transfer_file = fopen(filepath, "wb"); if(transfer_file) { is_uploading = true; xQueueReset(up_queue); send_notification((uint8_t*)"READY", 5); } else { send_notification((uint8_t*)"ERROR", 5); } }
            else if(!strcmp(pending_cmd, "end_upload")) { if(transfer_file) { fclose(transfer_file); transfer_file = NULL; } is_uploading = false; send_eof(); }
            else if(!strncmp(pending_cmd, "del ", 4)) { char *fname = pending_cmd+4; snprintf(filepath, sizeof(filepath), "%s/%s", MOUNT_POINT, (fname[0]=='/')?fname+1:fname); remove(filepath); send_eof(); }
            else if(!strncmp(pending_cmd, "cfg_rec ", 8)) { device_config_t cfg; load_config(&cfg); cfg.record_length_sec = atoi(pending_cmd+8); save_config(&cfg); send_eof(); }
            else if(!strncmp(pending_cmd, "cfg_acc ", 8)) { device_config_t cfg; load_config(&cfg); sscanf(pending_cmd+8, "%hu %hu %hu %hu", &cfg.accel_act_thresh, &cfg.accel_act_time, &cfg.accel_inact_thresh, &cfg.accel_inact_time); save_config(&cfg); send_eof(); }
            else if(!strncmp(pending_cmd, "time ", 5)) { int y, m, d, hh, mm, ss; if(sscanf(pending_cmd+5, "%d %d %d %d %d %d", &y, &m, &d, &hh, &mm, &ss)==6) { rtc_set_time_manual(y, m, d, hh, mm, ss); send_notification((uint8_t*)"SET:OK", 6); } else { send_notification((uint8_t*)"TIME_ERR", 8); } send_eof(); }
            else if(!strcmp(pending_cmd, "selftest")) { send_notification((uint8_t*)"TEST_START", 10); run_self_test(); send_eof(); }
            cmd_ready = false;
        }
        
        if(is_uploading && transfer_file && xQueueReceive(up_queue, &chk, 0)) { 
            fwrite(chk.data, 1, chk.len, transfer_file); 
        }
        else if(is_downloading && device_connected && transfer_file) {
            if(dl_len == 0) dl_len = fread(fileBuf, 1, TRANSFER_BLOCK_SIZE, transfer_file);
            
            if(dl_len > 0) {
                esp_err_t err = send_notification(fileBuf, dl_len);
                if(err == ESP_OK) {
                    dl_len = 0; 
                    vTaskDelay(pdMS_TO_TICKS(4)); 
                } else {
                    vTaskDelay(pdMS_TO_TICKS(20)); 
                }
            } else { 
                fclose(transfer_file); transfer_file = NULL; is_downloading = false; send_eof(); 
            }
        } else { 
            vTaskDelay(pdMS_TO_TICKS(10)); 
        }
    }
    
    free(fileBuf); vTaskDelete(NULL); 
}

/* ==================== 5.0 Bluetooth Setup & Main ==================== */
void bluetooth_mode_main() {
    gps_force_sleep();
    park_cs_pins(); 
    gpio_set_pull_mode(SPI_PIN_NUM_MISO, GPIO_PULLUP_ONLY); gpio_set_pull_mode(SPI_PIN_NUM_MOSI, GPIO_PULLUP_ONLY); gpio_set_pull_mode(SPI_PIN_NUM_CLK, GPIO_PULLUP_ONLY);
    
    if(!up_queue) up_queue = xQueueCreate(20, sizeof(up_chunk_t));

    esp_vfs_fat_sdmmc_mount_config_t mount_config = {.format_if_mount_failed=false, .max_files=5, .allocation_unit_size=16*1024};
    sdmmc_host_t host = SDSPI_HOST_DEFAULT(); host.slot = SPI2_HOST; host.max_freq_khz = 20000;
    spi_bus_config_t bus_cfg = {.mosi_io_num=SPI_PIN_NUM_MOSI, .miso_io_num=SPI_PIN_NUM_MISO, .sclk_io_num=SPI_PIN_NUM_CLK, .quadwp_io_num=-1, .quadhd_io_num=-1, .max_transfer_sz=4000};
    spi_bus_initialize(host.slot, &bus_cfg, SPI_DMA_CH_AUTO);
    sdspi_device_config_t slot_config = SDSPI_DEVICE_CONFIG_DEFAULT(); slot_config.gpio_cs=SD_PIN_NUM_CS; slot_config.host_id=host.slot;
    esp_vfs_fat_sdspi_mount(MOUNT_POINT, &host, &slot_config, &mount_config, &card);

    esp_bt_controller_config_t bt_cfg=BT_CONTROLLER_INIT_CONFIG_DEFAULT(); esp_bt_controller_init(&bt_cfg); esp_bt_controller_enable(ESP_BT_MODE_BLE); esp_bluedroid_init(); esp_bluedroid_enable();
    esp_ble_gatts_register_callback(gatts_event_handler); esp_ble_gap_register_callback(gap_event_handler); esp_ble_gatts_app_register(0);

    xTaskCreate(process_command_task, "bt_sd", 4096*2, NULL, 5, NULL);

    while(get_system_mode() == MODE_BLUETOOTH) { vTaskDelay(pdMS_TO_TICKS(250)); } 

    if(device_connected) { esp_ble_gatts_close(gatts_if_handle, conn_id); }
    vTaskDelay(pdMS_TO_TICKS(500)); 
    if(transfer_file) { fclose(transfer_file); transfer_file = NULL; }
    if(card) { esp_vfs_fat_sdcard_unmount(MOUNT_POINT, card); card = NULL; }
    if(up_queue) { vQueueDelete(up_queue); up_queue = NULL; }
    
    return;
}