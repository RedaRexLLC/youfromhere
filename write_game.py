import subprocess
result = subprocess.run(['curl', '-s', 'https://youfromhere.vercel.app'], capture_output=True, text=True)
with open('/Volumes/Seagate/You From Here/index.html', 'w') as f:
    f.write(result.stdout)
print("Lines written:", len(result.stdout.splitlines()))
