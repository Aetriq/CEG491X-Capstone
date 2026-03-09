<p align="center">
  <img src="/repo_img/logo2.png" alt="Project Logo" width="250" height="250">
</p>
<h1 align="center">Project EchoLog</h1>

<p align="center">
  CEG491X Capstone Project <br/>
  Faculty of Electrical and Computer Engineering @ University of Ottawa
  <br/>
  <br />

  <p align="center">
    <img src="https://img.shields.io/badge/Author-Max%20Liu-blue" alt="Max Liu">
    &nbsp;
    <img src="https://img.shields.io/badge/Author-Alejandro%20Jesus%20Chong%20Escalante-blue" alt="Alejandro Jesus Chong Escalante">
    &nbsp;
    <img src="https://img.shields.io/badge/Author-Alex%20Gordon-blue" alt="Alex Gordon">
    &nbsp;
    <img src="https://img.shields.io/badge/Author-Darrell%20Nyakaana-blue" alt="Darrell Nyakaana">
    &nbsp;
    <img src="https://img.shields.io/badge/Author-Amelia%20Spacek-blue" alt="Amelia Spacek">
  <p align="center">
 

## Project Description
Based on the needs of our client, EchoLog is designed to be applicable with similar goals of recording and storing different forms of logs in high intensity/stress environments. It can also can provide value to any party from individuals that are spending out of pocket to improve their volunteering experience, to organizations with varying budgets. 

![Concept Image Render](/repo_img/repo-img1.png)

---

## Features
- Fully handsfree operation & usage.
- Extremely low maitenance & high durability/physical protection.
- Rated for IP56 water/dust protection.
- Capable of sustaining external thermal loads up to 80C.
- Ultra low power, consuming <200mA peak, allowing for at least 8 hours of battery life. 
- Advanced gesture detection and fully autonomous recording of various formats, including audio and GPS.
- Dedicated app allows connection via USB-C serial and Bluetooth.

---

## Technologies Used
- **Frontend**: Angular, HTML, CSS.
- **Backend**: C, ESP-IDF Framework, Baremetal FreeRTOS
- **Image builder/flasher**: PlatformIO.

---

## Steps to Install
### Part 1: Setting up hardware
This is applicable to both the Heltec IOT Wireless Tracker v1.1 and the ESP32-S3 Supermini variants

#### Step 1: OS Support & Dependencies

Before you begin, ensure your system is prepared for serial communication. Check out this repository's 'Releases' tab for firmware downloads.

##### Supported Operating Systems
* **Windows 10/11:** Natively supported. Older versions may need CP210x or CH340 drivers
* **macOS:** High Sierra (>10.13) or newer. No additional drivers are usually required for the S3
* **Linux:** Ubuntu, Debian, Arch, etc.
    * Note: You may need to add your user to the dialout group: `sudo usermod -a -G dialout $USER`

##### Required Depedencies
1. Python >3.7:
2. Pip: 

#### Step 2: Install the Flashing Tool
[esptool.py](https://www.espressif.com/en/support/download/other-tools) is used, the official utility from Espressif. You may download the GUI version but the CLI is recommended. Open your Terminal/Command Prompt and run:

**pip install esptool**

To verify the installation, type esptool.py version

#### Step 3: Hardware Connection

1. Connect your ESP32-S3 to your computer using a **USB-C Data Cable**.
2. Identify your serial port.
    * **Windows:** Right-click Start > Device Manager > Ports (COM & LPT). Look for "USB Serial Port" or "ESP32-S3".
    * **macOS/Linux:** Run ls /dev/cu.* or ls /dev/ttyACM*.
3. Bootloader Mode (for Heltec Board): If the port doesn't appear, or the flash fails:
    * Press and hold the BOOT/USER button
    * Press the RESET (or RST) button once
    * Release the BOOT/USER button

#### Step 4: Flash the .bin File

Navigate to the folder containing your .bin file in your terminal. Use the command below, replacing PORT with your actual port (e.g. COM` or /dev/ttyACM0) and `your_file.bin` with your filename. For example,

**esptool.py --chip esp32s3 --port PORT --baud 921600 write_flash 0x0 FIRMWARE_2.0_HELTEC.bin**

#### Step 5: Reset and Verify

1. Once the terminal shows "Leaving... Hard resetting via RTS pin...", the process is finished.
2. Press the RESET button on the board to exit bootloader mode and run your program. IMPORTANT: DEVICE MUST BE IN DEEPSLEEP MODE WHEN PRESSING THE RST BUTTON!!!
3. (Optional) Open a Serial Monitor at 115200 baud to view the debug output.

### Part 2: Setting up software
To be determined soon....

---
## Credits
- [Get your project supported with the the Engineering Endowment Fund (EEF)](https://www.uottawa.ca/faculty-engineering/student-hub/funding-student-initiatives)
- [ESP32-S3 by EspressIF](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/)
- [EasyEDA](https://easyeda.com/)
- [AutoDesk Fusion](https://www.autodesk.com/products/fusion-360)
