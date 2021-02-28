#!/bin/bash -e

# Fetch latest code
git reset --hard HEAD
git pull

# Install npm packages
npm i

# Restart NodeJS service
sudo service nyt restart

# Update nginx config and restart it
sudo cp default-nginx /etc/nginx/sites-enabled/default
sudo service nginx restart

echo "Restarted nyt-scraper web service and nginx"
