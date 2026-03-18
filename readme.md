# Scheduler
Exposed a REST service that controls raspberry GPIOs per configurable weekly schedule

# Installation
sudo pip3 install requirements.txt
 
1. RTC: https://www.raspberrypi.org/forums/viewtopic.php?t=209700
1. Follow instructions in ~requirements.txt
1. Set `sudo crontab -e`<br>
```
29 3 * * *  /sbin/reboot
```

# Services
sudo pip3 install -r requirements.txt

## RPI Connect
sudo ln -s /home/lechu/scheduler/scripts/rpi-connect-lite.service /etc/systemd/system/rpi-connect-lite.service
sudo systemctl enable rpi-connect-lite.service
sudo service rpi-connect-lite start


journalctl -u scheduler

#sudo systemctl daemon-reload
journalctl -f

clear journal: journalctl --vacuum-size=500M



# Disable wifi power saving so that it reconnects
sudo nano /etc/NetworkManager/conf.d/wifi-powersave.conf
    [connection]
    wifi.powersave = 2
sudo systemctl restart NetworkManager
iw dev wlan0 get power_save


# Auth
curl -X POST http://0.0.0.0:8099/api/login -H "Content-Type: application/json" \
  -c cookies.txt -d '{"username":"admin","password":"admin"}'

# Create users
curl -X POST http://0.0.0.0:8099/api/users -H "Content-Type: application/json" \
  -b cookies.txt -d '{"username":"nadav","password":"pass","role":"admin"}'

curl -X POST http://lechu.nadalia.com/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "username": "newuser",
    "password": "secret123",
    "role": "user"
  }'