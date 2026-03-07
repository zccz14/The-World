#!/bin/bash
su - agent -c "opencode serve --hostname 0.0.0.0" &
node /daemon/RegionDaemon.js
