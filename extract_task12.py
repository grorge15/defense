import json
import re

path = r"C:\Users\Admin\.cursor\projects\c-Users-Admin-Defense2\agent-transcripts\274e5a43-58b4-4685-8638-9ebf2b28514a\274e5a43-58b4-4685-8638-9ebf2b28514a.jsonl"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

data = json.loads(lines[829])
text = data["message"]["content"][0]["text"]
start = text.find("任务 1.2")
rest = text[start + 1 :]
m = re.search(r"\n\s*- \*\*任务 1\.[3-9]", rest)
end = start + 1 + m.start() if m else len(text)
out = text[start:end].rstrip()

with open(r"C:\Users\Admin\Defense2\task12_extract.txt", "w", encoding="utf-8") as f:
    f.write(out)

print(out)
