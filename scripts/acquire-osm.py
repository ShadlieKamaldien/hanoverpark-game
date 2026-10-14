"""Refresh the existing finite Hanover Park snapshot from the official OSM API.
Only public feature names and geometry are retained; no contributor/contact data.
"""
import json, hashlib, subprocess, tempfile, datetime, xml.etree.ElementTree as ET
from pathlib import Path
API='https://api.openstreetmap.org/api/0.6'
RELATION=2046907
KEEP={'name','name:af','highway','building','building:levels','shop','amenity','leisure','place','width','lanes','oneway','branch','brand','sport','surface','landuse','type','boundary','wikipedia','wikidata','check_date','addr:street','website'}
def fetch(url,path):
 subprocess.run(['curl','--fail','--silent','--show-error','--max-time','120','-H','Accept: application/xml','-A','HanoverParkGame-map-refresh/0.1',url,'-o',str(path)],check=True)
 return ET.parse(path).getroot()
def extract(root):
 result={'nodes':{},'ways':{},'relations':{}}
 for e in root:
  if e.tag not in ('node','way','relation'):continue
  item={'id':int(e.get('id')),'tags':{t.get('k'):t.get('v') for t in e.findall('tag') if t.get('k') in KEEP}}
  if e.tag=='node':item.update(lat=float(e.get('lat')),lon=float(e.get('lon')))
  if e.tag=='way':item['nodes']=[int(n.get('ref')) for n in e.findall('nd')]
  if e.tag=='relation':item['members']=[{'type':m.get('type'),'ref':int(m.get('ref')),'role':m.get('role','')} for m in e.findall('member')]
  result[e.tag+'s'][item['id']]=item
 return result
with tempfile.TemporaryDirectory(prefix='hanover-map-') as directory:
 temp=Path(directory);boundary_url=f'{API}/relation/{RELATION}/full'
 boundary_doc=fetch(boundary_url,temp/'boundary.xml');boundary=extract(boundary_doc)
 relation=boundary['relations'][RELATION]
 if relation['tags'].get('name')!='Hanover Park':raise ValueError('Unexpected suburb relation; snapshot kept')
 pieces=[boundary['ways'][m['ref']]['nodes'][:] for m in relation['members'] if m['type']=='way' and m['role'] in ('outer','')]
 ring=pieces.pop(0)
 while pieces:
  for i,p in enumerate(pieces):
   if p[0]==ring[-1]:ring.extend(p[1:]);pieces.pop(i);break
   if p[-1]==ring[-1]:ring.extend(reversed(p[:-1]));pieces.pop(i);break
  else:raise ValueError('Boundary is not a single contiguous ring; manual review needed')
 if ring[0]!=ring[-1]:raise ValueError('Boundary is not closed')
 ns=boundary['nodes'];geo=[ns[i] for i in ring]
 actual=[min(n['lon'] for n in geo),min(n['lat'] for n in geo),max(n['lon'] for n in geo),max(n['lat'] for n in geo)]
 bbox=[round(actual[0]-.0002,4),round(actual[1]-.0002,4),round(actual[2]+.0002,4),round(actual[3]+.0002,4)]
 map_url=f'{API}/map?bbox='+','.join(map(str,bbox));snapshot=extract(fetch(map_url,temp/'map.xml'))
 for col in snapshot:snapshot[col]={**boundary[col],**snapshot[col]}
 if len(snapshot['nodes'])>50000:raise ValueError('Map is too large')
 if any(i not in snapshot['nodes'] for w in snapshot['ways'].values() for i in w['nodes']):raise ValueError('Incomplete way geometry')
 source={'provider':'OpenStreetMap contributors','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'urls':[map_url,boundary_url],'attribution':'© OpenStreetMap contributors','attributionUrl':'https://www.openstreetmap.org/copyright','license':'Open Database License (ODbL) 1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','notes':'Community-mapped suburb polygon, not a surveyed legal boundary. Footprints/names may be incomplete; returned ways can extend past the crop.','rawArtifacts':[{'file':'map.xml','sha256':hashlib.sha256((temp/'map.xml').read_bytes()).hexdigest()},{'file':'boundary.xml','sha256':hashlib.sha256((temp/'boundary.xml').read_bytes()).hexdigest()}]}
 data={'source':source,'bbox':bbox,'boundary':{'relationId':RELATION,'name':'Hanover Park','bbox':actual,'outerRings':[ring]},**{col:list(rows.values()) for col,rows in snapshot.items()}}
 staged=temp/'snapshot.json';staged.write_text(json.dumps(data,separators=(',',':'))+'\n')
 # Geometry/route validation must succeed before replacing the public snapshot.
 subprocess.run(['python3','scripts/import-osm.py',str(staged)],check=True)
 output=Path('public/map-data/hanover-park.osm.json');output.parent.mkdir(parents=True,exist_ok=True)
 output.with_suffix('.json.tmp').write_bytes(staged.read_bytes());output.with_suffix('.json.tmp').replace(output)
 print('Refreshed licensed snapshot and game geometry:',len(data['nodes']),'nodes;',len(data['ways']),'ways')
