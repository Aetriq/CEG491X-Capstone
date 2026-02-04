#ifndef RTC_MODULE_H
#define RTC_MODULE_H

#include <time.h>

void rtc_init_and_sync(void);
void rtc_set_time_manual(int year, int month, int day, int hour, int min, int sec);

#endif