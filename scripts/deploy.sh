#!/bin/bash -e

git reset --hard HEAD
git pull
sudo service nyt restart

echo "Restarted nyt-scraper web service"
