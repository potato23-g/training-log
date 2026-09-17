#!/bin/sh
# 全種目のコンタクトシートを4枚に分けて撮る
set -e
cd "$(dirname "$0")/.."
B1="goblet,rdl,rdl1,split"
B2="hipthrust,row,ohp,lateral"
B3="floorpress,pushup,curl,triext"
B4="plank,deadbug,crunch,sideplank,calf,farmer"
i=1
for ids in "$B1" "$B2" "$B3" "$B4"; do
  n=$(echo "$ids" | tr ',' '\n' | wc -l)
  h=$((n * 300 + 60))
  python tools/cdp_shot.py "file:///C:/claude%20code/training-log/tools/contact.html?ids=$ids&n=6&w=240&h=290" "shots/review_$i.png" \
    --ready "window.__ready===true" --width 1650 --height "$h" --full --log "shots/review_$i.log.json" --settle 1.2 --port "935$i"
  i=$((i + 1))
done
echo "done"
