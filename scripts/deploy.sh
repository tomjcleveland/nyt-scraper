#!/bin/bash -e

git reset --hard HEAD
git pull
sudo service nyt restart

# nginx
sudo cp default-nginx /etc/nginx/sites-enabled/default
sudo service nginx restart

echo "Restarted nyt-scraper web service and nginx"
