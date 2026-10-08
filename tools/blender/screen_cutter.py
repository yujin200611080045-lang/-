# 屏幕开孔工具 —— 1.46 寸圆屏
# 用法：Blender 顶部切到 Scripting → 新建 → 整段粘进去 → 点 ▶ 运行
# 会生成一个「屏幕开孔工具」集合，全部挂在一个叫「屏幕定位」的空物体底下，
# 只要移动/旋转「屏幕定位」，整套一起走。
# 默认脸朝前（-Y，也就是小键盘 1 前视图看到的那面）。
# 所有数字都是毫米，想改就改最上面这几行。

import bpy
from math import pi

GLASS_D = 44.77       # 玻璃外径
VIEW_D = 36.96        # 显示区直径（和玻璃在同一个平面，没有坡）
GLASS_T = 1.6         # 玻璃厚
BODY_T = 9.6          # 屏幕总厚
PCB_W = 39.18         # 电路板宽（这里近似成圆柱，只做参照）

WALL = 1.5            # 屏幕前面那层壳的厚度
HOLE_D = 37.5         # 露脸孔
POCKET_D = 45.3       # 卡槽直径（比玻璃大一点点）
POCKET_DEPTH = 6.5    # 卡槽深
REF_D = 46.0          # 粗切平面用的参照圆片

# 不管场景单位是米还是毫米，都换算成真实毫米
k = 0.001 / bpy.context.scene.unit_settings.scale_length

col = bpy.data.collections.get("屏幕开孔工具")
if col is None:
    col = bpy.data.collections.new("屏幕开孔工具")
    bpy.context.scene.collection.children.link(col)

root = bpy.data.objects.new("屏幕定位", None)
root.empty_display_type = 'CIRCLE'
root.empty_display_size = GLASS_D / 2 * k
root.rotation_euler = (pi / 2, 0, 0)
col.objects.link(root)


def mat(name, rgba):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = rgba
    return m


def disc(name, d, y_from, y_to, material=None, cutter=False):
    """沿 Y 轴的圆柱：从 y_from 到 y_to（往 +Y 是往头里面走）"""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=128,
        radius=d / 2 * k,
        depth=(y_to - y_from) * k,
        location=(0, (y_from + y_to) / 2 * k, 0),
        rotation=(pi / 2, 0, 0),
    )
    o = bpy.context.active_object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    o.parent = root
    o.matrix_parent_inverse = root.matrix_world.inverted()
    if material:
        o.data.materials.append(material)
    if cutter:
        o.display_type = 'WIRE'
        o.hide_render = True
    return o


# 参照：粗切平面就切到这个圆片的位置，y = 0 是脸的正面
disc("参照_平面Ø46", REF_D, -0.05, 0.05, mat("参照_橙", (1.0, 0.5, 0.1, 0.35)))

# 屏幕模型（只看，不参与布尔）
disc("屏幕_玻璃", GLASS_D, WALL, WALL + GLASS_T, mat("屏幕_玻璃", (0.6, 0.8, 1.0, 0.3)))
disc("屏幕_显示区", VIEW_D, WALL, WALL + 0.06, mat("屏幕_显示区", (0.1, 0.1, 0.1, 0.8)))
disc("屏幕_机身(近似)", PCB_W, WALL + GLASS_T, WALL + BODY_T, mat("屏幕_机身", (0.2, 0.6, 0.3, 0.3)))

# 切刀（线框显示，布尔差值用）
disc("切_露脸孔", HOLE_D, -10, WALL + 0.1, cutter=True)
disc("切_卡槽", POCKET_D, WALL, WALL + POCKET_DEPTH, cutter=True)

bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
bpy.context.view_layer.objects.active = root
print("屏幕开孔工具 OK")
