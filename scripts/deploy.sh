#!/bin/bash

git reset --hard HEAD
git pull
sudo service nyt restart
