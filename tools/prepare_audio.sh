#!/bin/bash
# Обрезает и выравнивает по громкости звуки игры. Запуск: tools/prepare_audio.sh <папка с исходниками>
set -e
S="$1"; O="$(dirname "$0")/../assets"
mkdir -p "$O/sfx" "$O/music"
cut() { # имя_выхода исходник начало длительность громкость
  ffmpeg -y -loglevel error -ss "$3" -t "$4" -i "$S/ogarok-zvuk-$2.mp3" \
    -af "loudnorm=I=-16:TP=-1.5,afade=t=out:st=$(python3 -c "print(max(0,$4-0.08))"):d=0.08,volume=$5" -ac 1 -ar 44100 -b:a 96k "$O/sfx/$1.mp3"
}
cut step shag 0.13 0.20 0.6
cut jump pryzhok 0 0.42 0.8
cut tongue yazyk 0 0.58 1
cut spit plevok 0 0.9 1
cut hurt udar 0 1.0 1
cut death smert 0 1.95 1
cut swamp boloto 0 0.96 1
cut bonus bonus 0 1.0 0.9
cut superjump superpryzhok 0 1.2 1
cut burp otryzhka 0 0.99 1
cut blast vzryv 0 0.79 1
cut teeth zuby 0 0.54 0.9
cut crumble stupenka 0 1.2 0.9
cut door dver 0 0.6 1
cut tick taymer 0 0.5 0.7
cut win pobeda 0 4.2 1
cut shell pancir 0 1.04 1
cut stone okamenenie 0 2.2 1
cut magnet magnit 0 0.91 1
ffmpeg -y -loglevel error -i "$S/ogarok-muzyka-3-tarantella.mp3" -af "loudnorm=I=-18:TP=-1.5" -ac 2 -ar 44100 -b:a 128k "$O/music/music.mp3"
echo готово
