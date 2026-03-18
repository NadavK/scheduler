# Scheduler
A REST service and companion web application that controls raspberry GPIOs per configurable weekly schedule

# Installation
1. `sudo pip3 install requirements.txt`
2. run: `/usr/bin/python3 /home/lechu/scheduler/main.py`
3. Service logs: `journalctl -u scheduler`

# Addition Suggestions 
1. Set daily reboot: `sudo crontab -e`<br>
```
29 3 * * *  /sbin/reboot
```
2. Disable wifi power saving so that it reconnects
sudo nano /etc/NetworkManager/conf.d/wifi-powersave.conf
    [connection]
    wifi.powersave = 2
sudo systemctl restart NetworkManager
iw dev wlan0 get power_save

3. RPI Connect
sudo ln -s /home/lechu/scheduler/scripts/rpi-connect-lite.service /etc/systemd/system/rpi-connect-lite.service
sudo systemctl enable rpi-connect-lite.service
sudo service rpi-connect-lite start

# Sample API calls
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
