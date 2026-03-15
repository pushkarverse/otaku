@echo off
echo Starting local server for Anime Hand Tracker (Naruto and Gojo)...
echo Please wait, your browser will open automatically.
start http://localhost:8000
python -m http.server 8000
