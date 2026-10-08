# 小克 头 v2：屏幕压圈+主板支架、侧面 USB 孔、额头摄像头仓、后脑散热孔、试配片
import bpy, bmesh, math, os, numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
mm=0.001
bpy.ops.wm.open_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','小克_头_斜切_磁铁.blend'))
sc=bpy.context.scene;O=bpy.data.objects
front=O['头_前脸'];back=O['头_后盖'];outer=O['外形']
for n in ('cur.001','切_卡槽Ø45.3','切_后脑勺','切_露脸孔Ø37','屏幕参考圆环','磁铁坑0','磁铁坑1','磁铁坑2','磁铁坑3'):
    if n in O: bpy.data.objects.remove(O[n])
E=lambda k,d: float(os.environ.get(k,d))
# ---------------- 参数（mm，头的局部坐标：脸朝 -y，屏幕中心在 x=z=0） ----------------
G_R=22.385; G_Y0=-18.97; G_T=1.6          # 屏幕玻璃
M_R=19.59; M_Y1=-9.37                      # 屏幕模组背面
POCKET_R=22.65; POCKET_Y1=-10.0            # 原来的屏幕卡槽
RING_IN=20.3; RING_OUT=21.9; RING_Y0=G_Y0+G_T-0.15; FL_Y0=-11.0; FL_Y1=-9.0   # 压圈前端比玻璃背面多压 0.15
BOARD_A=-4.4; PCB_T=1.6; HOLE=16.3; SO_R=2.2; PILOT=0.85; CLR=1.2   # 主板 A 面（朝屏幕）位置、M2 螺丝
EARS=[(55,24.4),(125,24.4),(-90,25.0)]     # 压圈耳朵：角度、半径
USB_Y=BOARD_A-1.6; USB_W=E('USBW',13.0); USB_H=E('USBH',9.0)  # 侧面 USB 孔（z 方向宽 × y 方向高）
CAM_Z=E('CAMZ',28.0); CAM_Y=E('CAMY',-14.25); CAM_T=math.radians(E('CAMT',0)); CAM_H=4.45; CAM_W=0.8; CAM_D=5.5; LENS_D=E('LENSD',7.5)
def sel(*os_):
    for q in sc.objects:q.select_set(False)
    for o in os_:o.select_set(True)
    bpy.context.view_layer.objects.active=os_[0]
def cyl(name,r,y0,y1,x=0,z=0,verts=96,axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r*mm,depth=abs(y1-y0)*mm)
    o=bpy.context.active_object;o.name=name;c=(y0+y1)/2
    if axis=='Y': o.rotation_euler=(math.pi/2,0,0);o.location=(x*mm,c*mm,z*mm)
    elif axis=='X': o.rotation_euler=(0,math.pi/2,0);o.location=(c*mm,x*mm,z*mm)   # 这时 x 参数当 y 用
    sel(o);bpy.ops.object.transform_apply(location=False,rotation=True,scale=False);return o
def box(name,x0,x1,y0,y1,z0,z1,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=((x0+x1)/2*mm,(y0+y1)/2*mm,(z0+z1)/2*mm));o=bpy.context.active_object;o.name=name
    o.scale=((x1-x0)*mm,(y1-y0)*mm,(z1-z0)*mm);sel(o);bpy.ops.object.transform_apply(scale=True)
    if bevel: bev(o,bevel)
    return o
def bev(o,r,seg=8,only=None):
    m=o.modifiers.new('bv','BEVEL');m.width=r*mm;m.segments=seg;m.limit_method='NONE' if only is None else 'ANGLE'
    sel(o);bpy.ops.object.modifier_apply(modifier='bv')
def boolean(a,b,op,keep=False):
    m=a.modifiers.new('b','BOOLEAN');m.operation=op;m.object=b;m.solver='MANIFOLD'
    sel(a);bpy.ops.object.modifier_apply(modifier='b')
    if not keep: bpy.data.objects.remove(b)
    return a
def dup(o,name):
    c=o.copy();c.data=o.data.copy();c.name=name;sc.collection.objects.link(c);return c
def tube(name,ri,ro,y0,y1):
    a=cyl(name,ro,y0,y1,verts=192);b=cyl('t',ri,y0-1,y1+1,verts=192);return boolean(a,b,'DIFFERENCE')
def polar(a,r): return r*math.cos(math.radians(a)),r*math.sin(math.radians(a))
# 外形往里缩 1mm（壁厚中间）：用来修剪凸起、螺丝柱，不让它们捅出外表面
mid=dup(outer,'外形_缩1');d=mid.modifiers.new('d','DISPLACE');d.strength=-1.0*mm;d.mid_level=0;d.direction='NORMAL'
sel(mid);bpy.ops.object.modifier_apply(modifier='d')
# ================= 1. 压圈 + 主板支架（单独打印） =================
br=tube('支架',RING_IN,RING_OUT,RING_Y0,FL_Y0+0.01)
fl=tube('fl',RING_IN,RING_OUT,FL_Y0,FL_Y1);boolean(br,fl,'UNION')
for a,r in EARS:
    x,z=polar(a,r);lobe=cyl('lobe',2.6,FL_Y0,FL_Y1,x,z,48)
    # 耳朵和圈之间的连接
    ang=math.radians(a);L=r-(RING_IN+0.5)
    bar=box('bar',-2.6,2.6,FL_Y0,FL_Y1,0,L);bar.matrix_world=Matrix.Translation(Vector((0,0,0)))@Matrix.Rotation(ang-math.pi/2,4,'Y')
    bar.matrix_world=Matrix.Rotation(-(ang-math.pi/2),4,'Y')@Matrix.Translation(Vector((0,0,(RING_IN+0.5)*mm)))
    sel(bar);bpy.ops.object.transform_apply(location=True,rotation=True,scale=False)
    boolean(br,bar,'UNION');boolean(br,lobe,'UNION')
for sx in (-1,1):
    for sz in (-1,1):
        so=cyl('so',SO_R,FL_Y0,BOARD_A,sx*HOLE,sz*HOLE,48);boolean(br,so,'UNION')
        boolean(br,cyl('pilot',PILOT,BOARD_A-5.5,BOARD_A+1,sx*HOLE,sz*HOLE,24),'DIFFERENCE')
for a,r in EARS:
    x,z=polar(a,r);boolean(br,cyl('h',CLR,FL_Y0-1,FL_Y1+1,x,z,32),'DIFFERENCE')
# 侧面 USB 插头经过的地方，压圈让开
boolean(br,box('usbnotch',19.0,30,USB_Y-USB_H/2-0.5,0,-USB_W/2-0.5,USB_W/2+0.5),'DIFFERENCE')
# ================= 2. 前脸：螺丝柱、USB 孔、摄像头仓 =================
pk=cyl('pk',POCKET_R,-19.0,POCKET_Y1,verts=192)   # 屏幕卡槽，最后再挖一次
for a,r in EARS:
    x,z=polar(a,r);b=cyl('boss',SO_R,FL_Y0-25,FL_Y0,x,z,48)
    boolean(b,mid,'INTERSECT',keep=True);boolean(front,b,'UNION')
    boolean(front,cyl('bh',PILOT,FL_Y0-6,FL_Y0+1,x,z,24),'DIFFERENCE')
# 摄像头：L 是镜头座最前面，a 是镜头朝向
SIDE=E('SIDE',1);a=Vector((0,-math.cos(CAM_T),SIDE*math.sin(CAM_T)));up=SIDE*Vector((0,math.sin(CAM_T),math.cos(CAM_T)))
L=Vector((0,CAM_Y,SIDE*CAM_Z))
R=Matrix((Vector((SIDE,0,0)),-a,up)).transposed().to_4x4()   # 局部 x→x, 局部 y→-a(往后), 局部 z→up
def campart(name,hw,s0,s1,bev_r=0):
    o=box(name,-hw,hw,s0,s1,-hw,hw,bev_r);o.matrix_world=Matrix.Translation(L*mm)@R
    sel(o);bpy.ops.object.transform_apply(location=True,rotation=True,scale=False);return o
sleeve=campart('sleeve',CAM_H+CAM_W,-CAM_W,CAM_D,0.6)
pocket=campart('campocket',CAM_H,0,CAM_D+25)
lens=cyl('lens',LENS_D/2,-0.6,12,verts=64);lens.matrix_world=Matrix.Translation(L*mm)@R;sel(lens);bpy.ops.object.transform_apply(location=True,rotation=True,scale=False)
# 鼓包：椭球，只取外表面以外那部分（往里留 1mm 跟外壳咬住）
bpy.ops.mesh.primitive_uv_sphere_add(segments=96,ring_count=48,radius=1)
bump=bpy.context.active_object;bump.name='bump'
BX=E('BX',10);BU=E('BU',5);BA=E('BA',8)
cen=L-a*E('BC',3)+up*E('BUP',2)
bump.matrix_world=Matrix.Translation(cen*mm)@R@Matrix.Diagonal((BX*mm,BA*mm,BU*mm,1))
sel(bump);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
boolean(bump,mid,'DIFFERENCE',keep=True)
boolean(front,bump,'UNION');boolean(front,sleeve,'UNION')
boolean(front,pocket,'DIFFERENCE');boolean(front,lens,'DIFFERENCE')
boolean(front,pk,'DIFFERENCE')
# 侧面 USB-C 孔（在 +x 侧，也就是小克的左耳位置）
usb=box('usbhole',18.0,40,USB_Y-USB_H/2,USB_Y+USB_H/2,-USB_W/2,USB_W/2,2.5)
boolean(front,usb,'DIFFERENCE')
# ================= 3. 后盖：散热/收音孔 =================
for i in range(5):
    z=-9+i*3.2;s=box('vent',-6,6,10,40,z-0.8,z+0.8,0.7);boolean(back,s,'DIFFERENCE')
# ================= 4. 参考零件（不打印） =================
ref=bpy.data.collections.new('参考零件_不打印');sc.collection.children.link(ref)
def toref(o):
    for c in list(o.users_collection):c.objects.unlink(o)
    ref.objects.link(o);return o
toref(cyl('屏幕玻璃',G_R,G_Y0,G_Y0+G_T,verts=128));toref(cyl('屏幕模组',M_R,G_Y0+G_T,M_Y1,verts=128))
pcb=box('主板',-18.5,18.5,BOARD_A,BOARD_A+PCB_T,-18.5,18.5)
for sx in (-1,1):
    for sz in (-1,1): boolean(pcb,cyl('h',1.1,BOARD_A-1,BOARD_A+3,sx*HOLE,sz*HOLE,24),'DIFFERENCE')
toref(pcb)
toref(box('主板A面元件',-17,17,BOARD_A-3.5,BOARD_A,-14,14))
toref(box('主板B面元件',-17,17,BOARD_A+PCB_T,BOARD_A+PCB_T+2.2,-14,14))
toref(box('USB-C座',18.5-7.3,19.8,BOARD_A-3.2,BOARD_A,-4.5,4.5))
toref(box('USB插头(示意)',19.8,34,USB_Y-3.3,USB_Y+3.3,-6.2,6.2,1.5))
toref(campart('摄像头(示意)',4.25,0,CAM_D))
bpy.data.objects.remove(mid)
for o in (front,back,br): 
    for p in o.data.polygons: p.use_smooth=True
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.environ.get('OUT','小克_头v2_重新生成.blend')))
print('BUILD OK')
