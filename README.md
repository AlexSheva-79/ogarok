# Восхождение Огарка

Глиняный огарок свечи карабкается по ступеням вращающейся башни над бездной, чтобы зажечь Великую Свечу на вершине.

- Играть в браузере: https://alexsheva-79.github.io/ogarok/
- APK для Android (собирается сам при каждом обновлении main): https://github.com/alexsheva-79/ogarok/releases/download/apk-latest/ogarok.apk

## Управление
- Держать палец слева или справа: идти. Короткий тап: прыжок.
- Свайп вниз: войти в дверь. Свайп вверх: плевок языком.
- Кнопка бонуса справа внизу. Кнопки на экране можно выключить в меню или на паузе.
- На компьютере: стрелки, пробел (прыжок), ↓ (дверь), ↑ или X (плевок), B (бонус), P/Esc (пауза).

## Устройство
- Phaser 3.90 без сборщика: `index.html`, `src/game.js`, `vendor/phaser.min.js`.
- Картинки и звуки готовятся скриптами `tools/prepare_assets.py` и `tools/prepare_audio.sh` из исходников в папке ИГРА.
- Android: Capacitor 8, сборка в `.github/workflows/android.yml`.

## Авторы звука
- Музыка: «Halloween BGM Tarantella», pianocafe_kumi, Pixabay (лицензия Pixabay).
- Звуковые эффекты: Freesound, лицензия CC0.
