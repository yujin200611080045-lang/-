# 在头的平面上，精确选中以屏幕为中心、半径 R 以内的面
# 用法：头进编辑模式（面模式）→ Scripting 里粘贴 → 改 REF_NAME → ▶ 运行
# 跑完回到 Layout，圈里的面已经选中：按 H 藏起来，或者去雕刻模式「面组 → 从编辑模式选择创建面组」

import bpy
import bmesh
from mathutils import Vector

REF_NAME = "圆环"   # 屏幕那个圆环物体的名字（大纲里叫什么就填什么）
R = 23.0            # 半径，毫米（23 = Ø46）

k = 0.001 / bpy.context.scene.unit_settings.scale_length
head = bpy.context.edit_object
ref = bpy.data.objects[REF_NAME]

c = ref.matrix_world.translation
axis = (ref.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()

mw = head.matrix_world
nm = mw.to_3x3().inverted().transposed()
bm = bmesh.from_edit_mesh(head.data)

for f in bm.faces:
    f.select_set(False)

n = 0
for f in bm.faces:
    d = mw @ f.calc_center_median() - c
    radial = (d - axis * d.dot(axis)).length
    facing = abs((nm @ f.normal).normalized().dot(axis))
    if radial < R * k and facing > 0.98:
        f.select_set(True)
        n += 1

bm.select_flush_mode()
bmesh.update_edit_mesh(head.data)
print("选中", n, "个面")
