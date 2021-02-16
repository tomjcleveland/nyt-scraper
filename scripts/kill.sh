#!/bin/bash

ps aux | grep crawl | awk '{print $2}' | xargs kill -9
