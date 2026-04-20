import zipfile, re

with zipfile.ZipFile('SHY Tribe.docx') as z:
    xml = z.read('word/document.xml').decode('utf-8')

descs = re.findall('descr="([^"]+)"', xml)
seen = set()
for i, d in enumerate(descs):
    clean = d.strip()
    if clean and clean not in seen and 'AI-generated' not in clean:
        seen.add(clean)
        print('--- ' + str(i+1) + ' ---')
        print(clean)
        print()
