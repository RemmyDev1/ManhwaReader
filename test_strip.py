import re
t = "Wait—"
t = re.sub(r'^[^\w\'"]+|[^\w\.\!\?\'"]+$', '', t)
print(t)
