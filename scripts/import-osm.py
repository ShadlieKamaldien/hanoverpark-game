"""Project the licensed, verified OSM snapshot into the game's north-up world.
Python standard library only. Re-run after an intentional source data refresh.
"""
import json, math, heapq, sys, hashlib
from pathlib import Path
source_path=Path(sys.argv[1] if len(sys.argv)>1 else 'public/map-data/hanover-park.osm.json')
s=json.loads(source_path.read_text());ns={n['id']:n for n in s['nodes']}
ways_by_id={w['id']:w for w in s['ways']}
bbox=s['bbox'];minlon,minlat,maxlon,maxlat=bbox
ppm=8;pad=96;cos=math.cos(math.radians((minlat+maxlat)/2))
width=round((maxlon-minlon)*111320*cos*ppm+pad*2);height=round((maxlat-minlat)*111320*ppm+pad*2)
def project(n):return {'x':round((n['lon']-minlon)*111320*cos*ppm+pad,2),'y':round((maxlat-n['lat'])*111320*ppm+pad,2)}
pn={i:project(n) for i,n in ns.items()}
def points(w):return [pn[i] for i in w['nodes'] if i in pn]
def bounds(ps):
 x=min(p['x'] for p in ps);y=min(p['y'] for p in ps)
 return {'x':x,'y':y,'w':max(p['x'] for p in ps)-x,'h':max(p['y'] for p in ps)-y}
def centre(ps):return {'x':sum(p['x'] for p in ps)/len(ps),'y':sum(p['y'] for p in ps)/len(ps)}
def inside(p,ps):
 result=False
 for a,b in zip(ps,ps[1:]+ps[:1]):
  if (a['y']>p['y'])!=(b['y']>p['y']) and p['x'] < (b['x']-a['x'])*(p['y']-a['y'])/(b['y']-a['y'])+a['x']:result=not result
 return result
boundary=[pn[i] for i in s['boundary']['outerRings'][0]]
buildings=[];fields=[];roads=[];graph={}

def stitched_rings(members,relation_id):
 """Join split OSM relation ways by node IDs without closing open geometry."""
 pieces=[]
 for member in members:
  way=ways_by_id.get(member['ref'])
  if not way or any(i not in pn for i in way['nodes']):
   raise ValueError(f'Incomplete building relation {relation_id}')
  if len(way['nodes'])<2:raise ValueError(f'Invalid building relation {relation_id}')
  pieces.append(way['nodes'][:])
 rings=[]
 while pieces:
  ring=pieces.pop(0)
  while ring[0]!=ring[-1]:
   for i,piece in enumerate(pieces):
    if piece[0]==ring[-1]:ring.extend(piece[1:]);pieces.pop(i);break
    if piece[-1]==ring[-1]:ring.extend(reversed(piece[:-1]));pieces.pop(i);break
   else:raise ValueError(f'Open building relation ring {relation_id}')
  if len(set(ring))<3:raise ValueError(f'Degenerate building relation {relation_id}')
  rings.append([pn[i] for i in ring])
 return rings

def footprint(osm_id,osm_type,t,ps,holes=None,part=None):
 name=t.get('name');kind=t['building']
 if name and any(v in name.lower() for v in ('court','hof')):kind='apartments'
 levels=t.get('building:levels','3' if kind=='apartments' else '1').split(';')[0]
 result={'id':osm_id,'osmType':osm_type,'name':name,'kind':kind,'points':ps,'bounds':bounds(ps),'levels':int(levels) if levels.isdigit() else 1}
 if holes:result['holes']=holes
 if part is not None:result['part']=part
 return result

# OSM places building tags on relations rather than on their untagged member
# ways. Preserve the relation ID and courtyard holes instead of dropping them.
building_members=set()
for relation in s.get('relations',[]):
 t=relation.get('tags',{})
 if not t.get('building') or t.get('type')!='multipolygon':continue
 members=[m for m in relation['members'] if m['type']=='way']
 outers=stitched_rings([m for m in members if m['role'] in ('outer','')],relation['id'])
 inners=stitched_rings([m for m in members if m['role']=='inner'],relation['id'])
 if not outers:raise ValueError(f'Building relation {relation["id"]} has no outer ring')
 assigned=[[] for _ in outers]
 for hole in inners:
  matches=[i for i,outer in enumerate(outers) if inside(hole[0],outer)]
  if len(matches)!=1:raise ValueError(f'Unassigned or ambiguous courtyard in relation {relation["id"]}')
  assigned[matches[0]].append(hole)
 added=False
 for i,outer in enumerate(outers):
  if not inside(centre(outer),boundary):continue
  buildings.append(footprint(relation['id'],'relation',t,outer,assigned[i],i if len(outers)>1 else None));added=True
 if added:building_members.update(m['ref'] for m in members)

for w in s['ways']:
 t=w.get('tags',{});ps=points(w)
 if len(ps)<2:continue
 if t.get('highway') and any(0<p['x']<width and 0<p['y']<height for p in ps):
  kind=t['highway'];road_width=28 if kind in ('footway','path','steps','cycleway') else 76 if kind in ('living_street','service') else 96 if kind=='residential' else 128
  roads.append({'id':w['id'],'name':t.get('name'), 'kind':kind,'width':road_width,'points':ps})
  if kind not in ('motorway','motorway_link','construction','proposed'):
   for a,b in zip(w['nodes'],w['nodes'][1:]):
    if a not in pn or b not in pn:continue
    pa,pb=pn[a],pn[b]
    if not (35<pa['x']<width-35 and 35<pa['y']<height-35 and 35<pb['x']<width-35 and 35<pb['y']<height-35):continue
    cost=math.hypot(pa['x']-pb['x'],pa['y']-pb['y']);graph.setdefault(a,{})[b]=cost;graph.setdefault(b,{})[a]=cost
 if t.get('building') and w['id'] not in building_members and len(ps)>3 and inside(centre(ps),boundary):
  buildings.append(footprint(w['id'],'way',t,ps))
 if t.get('leisure') in ('pitch','sports_centre','park') and len(ps)>3 and inside(centre(ps),boundary):fields.append({'osmType':'way','id':w['id'],'name':t.get('name'),'kind':t['leisure'],'points':ps,'bounds':bounds(ps)})
if not any(road['name']=='Downberg Road' for road in roads):
 raise ValueError('Expected Downberg Road is missing; source requires review')
pois=[]
for e in s['nodes']+s['ways']:
 t=e.get('tags',{});name=t.get('name');p=project(e) if 'lat' in e else centre(points(e)) if points(e) else None
 if name and p and inside(p,boundary) and any(k in t for k in ('shop','amenity','leisure')):
  if t.get('shop') or t.get('amenity') in ('pharmacy','fuel','fast_food','library','taxi') or t.get('leisure')=='pitch':
   branch=t.get('branch');name=name+(' '+branch if branch and branch.lower() not in name.lower() else '')
   pois.append({'id':e['id'],'osmType':'node' if 'lat' in e else 'way','name':name,'kind':t.get('shop') or t.get('amenity') or t.get('leisure'),'x':round(p['x'],2),'y':round(p['y'],2)})
def segment_distance(p,a,b):
 dx=b['x']-a['x'];dy=b['y']-a['y'];l=dx*dx+dy*dy;t=max(0,min(1,((p['x']-a['x'])*dx+(p['y']-a['y'])*dy)/l)) if l else 0
 return math.hypot(p['x']-(a['x']+t*dx),p['y']-(a['y']+t*dy))
def free(p,r=34):
 if not (40<p['x']<width-40 and 40<p['y']<height-40):return False
 for building in buildings:
  holes=building.get('holes',[])
  if inside(p,building['points']) and not any(inside(p,hole) for hole in holes):return False
  for ring in [building['points'],*holes]:
   if any(segment_distance(p,a,b)<r for a,b in zip(ring,ring[1:]+ring[:1])):return False
 return True
# Only road graph nodes outside sourced building footprints become gameplay entrances.
valid=[i for i in graph if inside(pn[i],boundary) and free(pn[i])]
def nearest(p):return min(valid,key=lambda i:math.hypot(pn[i]['x']-p['x'],pn[i]['y']-p['y']))
shop=next(p for p in pois if p['name'].startswith('Shoprite'))
fatima_node=nearest(shop);fatima=pn[fatima_node]
spawn=next({'x':fatima['x']+dx,'y':fatima['y']+dy} for dx,dy in [(-46,0),(46,0),(0,46),(0,-46)] if free({'x':fatima['x']+dx,'y':fatima['y']+dy},12))
car=next({'x':fatima['x']+dx,'y':fatima['y']+dy} for dx,dy in [(100,0),(-100,0),(0,100),(0,-100)] if free({'x':fatima['x']+dx,'y':fatima['y']+dy},34))
# Park on a real driveable road segment and face along it, rather than a mall wall.
car_segments=[]
for road in roads:
 if road['kind'] in ('footway','path','steps','cycleway','pedestrian','motorway','motorway_link'):continue
 for a,b in zip(road['points'],road['points'][1:]):
  dx=b['x']-a['x'];dy=b['y']-a['y'];length=dx*dx+dy*dy
  if not length:continue
  t=max(0,min(1,((car['x']-a['x'])*dx+(car['y']-a['y'])*dy)/length))
  point={'x':round(a['x']+t*dx,2),'y':round(a['y']+t*dy,2)}
  if not free(point,34):continue
  # Prefer the eastbound direction of the segment for a clear initial departure.
  if dx<0:dx=-dx;dy=-dy
  car_segments.append((math.hypot(car['x']-point['x'],car['y']-point['y']),point,math.atan2(dx,-dy)))
if not car_segments:raise ValueError('No clear mapped road segment for the story car')
_,car,car_angle=min(car_segments,key=lambda row:row[0]);car={**car,'angle':car_angle}
target_building=next(b for b in buildings if b['name']=='Blinkwater Hof');target_node=nearest(centre(target_building['points']));target={**pn[target_node],'name':target_building['name'],'id':target_building['id']}
# Shortest connected walking route, preserved as actual OSM node segments.
dist={fatima_node:0};prev={};queue=[(0,fatima_node)]
while queue:
 d,i=heapq.heappop(queue)
 if d!=dist[i]:continue
 if i==target_node:break
 for j,c in graph[i].items():
  # Exclude mapped segments that cut through solid buildings.
  a,b=pn[i],pn[j]
  if not free({'x':(a['x']+b['x'])/2,'y':(a['y']+b['y'])/2},12):continue
  nd=d+c
  if nd<dist.get(j,float('inf')):dist[j]=nd;prev[j]=i;heapq.heappush(queue,(nd,j))
if target_node not in dist:raise ValueError('Delivery entrance is not connected to the actual walking graph')
route=[];i=target_node
while i!=fatima_node:route.append(pn[i]);i=prev[i]
route.append(fatima);route.reverse()
# Omit nearly collinear intermediates while preserving bends and junctions.
compact=[route[0]]
for i in range(1,len(route)-1):
 a=compact[-1];b=route[i];c=route[i+1];cross=abs((b['x']-a['x'])*(c['y']-b['y'])-(b['y']-a['y'])*(c['x']-b['x']))
 length=max(1,math.hypot(c['x']-a['x'],c['y']-a['y']))
 if cross/length>5:compact.append(b)
compact.append(route[-1])
field=next(f for f in fields if f['name']=='Downberg Sports Field');pitch={**centre(field['points']),'name':'Downberg Sports Field'}
taxi_node=nearest(next((p for p in pois if p['kind']=='taxi'),shop));taxi=pn[taxi_node]
gatie_node=nearest({'x':fatima['x']+250,'y':fatima['y']+350});gatie=pn[gatie_node]
jerome_node=nearest({'x':fatima['x']-350,'y':fatima['y']+200});jerome=pn[jerome_node]
walkers=[]
for i in valid[::max(1,len(valid)//25)][:25]:
 neighbors=[j for j in graph[i] if free(pn[j],12)]
 if neighbors:
  a,b=pn[i],pn[neighbors[0]];l=max(1,math.hypot(b['x']-a['x'],b['y']-a['y']));walkers.append({**a,'dx':(b['x']-a['x'])/l*min(l,100),'dy':(b['y']-a['y'])/l*min(l,100)})
result={'id':'hanover-park-osm-'+hashlib.sha256(json.dumps({'roads':roads,'buildings':buildings,'boundary':boundary},sort_keys=True).encode()).hexdigest()[:12],'width':width,'height':height,'source':s['source'],'projection':{'originLatitude':maxlat,'originLongitude':minlon,'pixelsPerMetre':ppm,'latitudeCosine':cos,'padding':pad,'orientation':'north up'},'boundary':boundary,'roads':roads,'buildings':buildings,'fields':fields,'pois':pois,'locations':{'spawn':spawn,'car':car,'fatima':fatima,'gatie':gatie,'jerome':jerome,'target':target,'pitch':pitch,'taxi':taxi,'shop':shop,'walkers':walkers},'deliveryPath':compact,'notes':['Road centrelines and named footprints come from OSM; road widths are enlarged for gameplay.','Building coverage is incomplete. Unmapped courts are not assigned guessed names.','NPCs, entrances, vehicle spawn, dialogue and story are fictional, positioned in clear space near mapped locations.']}
encoded=json.dumps(result,separators=(',',':'))+'\n'
for output in [Path('src/game/world/mapData.json'),Path('public/map-data/hanover-park.game.json')]:
 output.parent.mkdir(parents=True,exist_ok=True)
 staged=output.with_suffix('.json.tmp');staged.write_text(encoded);staged.replace(output)
print('Projected',width,height,'world;',len(roads),'roads',len(buildings),'buildings',len(pois),'POIs;',len(compact),'route turns; route',round(dist[target_node]/ppm),'metres')
print('LOCATIONS',json.dumps(result['locations'],ensure_ascii=False)[:1500])
