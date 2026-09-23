"""Детерминированный набор города: Blender 4.0+, без дополнений и внешних ассетов."""

import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


OUTPUT = Path(__file__).resolve().parents[1]
PALETTE = {
    "wall": (0.79, 0.79, 0.79),
    "light": (0.96, 0.96, 0.96),
    "trim": (0.59, 0.59, 0.59),
    "roof": (0.35, 0.35, 0.35),
    "window": (0.13, 0.13, 0.13),
    "reflection": (0.34, 0.34, 0.34),
    "steel": (0.20, 0.27, 0.30),
    "blue": (0.21, 0.51, 0.66),
    "glass": (0.44, 0.68, 0.72),
    "wood": (0.58, 0.36, 0.17),
    "bark": (0.32, 0.24, 0.16),
    "leaf": (0.31, 0.58, 0.28),
    "leaf_light": (0.47, 0.69, 0.35),
    "leaf_dark": (0.21, 0.44, 0.23),
    "cream": (0.89, 0.86, 0.75),
    "warm": (0.99, 0.86, 0.46),
}


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


class Shape:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.colors = []

    def mesh(self, vertices, faces, color):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(index + offset for index in face) for face in faces)
        self.colors.extend([PALETTE.get(color, color)] * len(faces))

    def box(self, size, center, color, bevel=0):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=size, verts=bm.verts)
        if bevel:
            bmesh.ops.bevel(
                bm, geom=list(bm.edges), offset=min(bevel, min(size) * 0.25),
                segments=1, affect="EDGES", clamp_overlap=True,
            )
        bm.verts.ensure_lookup_table()
        bm.verts.index_update()
        self.mesh(
            [tuple(vertex.co + Vector(center)) for vertex in bm.verts],
            [tuple(vertex.index for vertex in face.verts) for face in bm.faces],
            color,
        )
        bm.free()

    def cylinder(self, radius, height, center, color, sides=12, top=None):
        upper = radius if top is None else top
        vertices = []
        for z, r in ((-height / 2, radius), (height / 2, upper)):
            vertices.extend((center[0] + r * math.cos(i * math.tau / sides),
                             center[1] + r * math.sin(i * math.tau / sides),
                             center[2] + z) for i in range(sides))
        faces = [tuple(reversed(range(sides))), tuple(range(sides, 2 * sides))]
        faces.extend((i, (i + 1) % sides, (i + 1) % sides + sides, i + sides)
                     for i in range(sides))
        self.mesh(vertices, faces, color)

    def branch(self, start, end, radius, color):
        vector = Vector(end) - Vector(start)
        rotation = Vector((0, 0, 1)).rotation_difference(vector.normalized())
        center = (Vector(start) + Vector(end)) / 2
        part = Shape()
        part.cylinder(radius, vector.length, (0, 0, 0), color, sides=6, top=radius * 0.7)
        self.mesh([tuple(rotation @ Vector(vertex) + center) for vertex in part.vertices],
                  part.faces, color)

    def crown(self, center, scale, color, phase=0):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1)
        bm.verts.ensure_lookup_table()
        bm.verts.index_update()
        rotation = Matrix.Rotation(phase, 3, "Z")
        vertices = [tuple((rotation @ vertex.co) * Vector(scale) + Vector(center))
                    for vertex in bm.verts]
        self.mesh(vertices, [tuple(vertex.index for vertex in face.verts) for face in bm.faces], color)
        bm.free()

    def window(self, u, z, width, height, plane, axis="y", side=-1):
        # Плоские панели экономят полигоны: оконные рамы читаются через цвет и перемычку.
        def panel(center_u, center_z, w, h, offset, color):
            left, right = center_u - w / 2, center_u + w / 2
            bottom, top = center_z - h / 2, center_z + h / 2
            p = plane + side * offset
            if axis == "y":
                vertices = [(left, p, bottom), (right, p, bottom),
                            (right, p, top), (left, p, top)]
                order = (0, 1, 2, 3) if side < 0 else (3, 2, 1, 0)
            else:
                vertices = [(p, left, bottom), (p, right, bottom),
                            (p, right, top), (p, left, top)]
                order = (0, 1, 2, 3) if side > 0 else (3, 2, 1, 0)
            self.mesh(vertices, [order], color)
        panel(u, z, width, height, 0, "window")
        panel(u, z, width * 0.10, height, 0.004, "trim")
        panel(u - width * 0.23, z + height * 0.33,
              width * 0.34, height * 0.10, 0.006, "reflection")

    def normalize(self, building=False):
        low = [min(vertex[i] for vertex in self.vertices) for i in range(3)]
        high = [max(vertex[i] for vertex in self.vertices) for i in range(3)]
        xy = max(high[0] - low[0], high[1] - low[1]) if building else 1
        z_scale = high[2] - low[2] if building else 1
        self.vertices = [((v[0] - (low[0] + high[0]) / 2) / xy,
                          (v[1] - (low[1] + high[1]) / 2) / xy,
                          (v[2] - low[2]) / z_scale) for v in self.vertices]

    def object(self, name, material):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        attribute = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
        mesh.color_attributes.active_color = attribute
        for face, color in zip(mesh.polygons, self.colors):
            rgba = tuple(linear(channel) for channel in color) + (1,)
            for loop in face.loop_indices:
                attribute.data[loop].color = rgba
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def facade(shape, width, depth, height, floors, bays, center=(0, 0), sides=True):
    x, y = center
    floor_h = (height - 0.30) / floors
    shape.box((width, depth, height), (x, y, height / 2), "wall", 0.025)
    shape.box((width + 0.05, depth + 0.05, 0.12), (x, y, 0.06), "trim")
    shape.box((width + 0.08, depth + 0.08, 0.08), (x, y, height + 0.04), "light")
    shape.box((width - 0.13, depth - 0.13, 0.025), (x, y, height + 0.089), "roof")
    for floor in range(floors):
        z = 0.22 + floor_h * (floor + 0.5)
        for side in (-1, 1):
            for bay in range(bays):
                u = x + width * ((bay + 0.5) / bays - 0.5)
                shape.window(u, z, width / bays * 0.59, floor_h * 0.56,
                             y + side * (depth / 2 + 0.003), side=side)
        if sides:
            side_bays = max(1, round(depth / (width / bays)))
            for side in (-1, 1):
                for bay in range(side_bays):
                    u = y + depth * ((bay + 0.5) / side_bays - 0.5)
                    shape.window(u, z, depth / side_bays * 0.56, floor_h * 0.56,
                                 x + side * (width / 2 + 0.003), axis="x", side=side)


def entrance(shape, x, y, width=0.45):
    shape.box((width, 0.06, 0.44), (x, y - 0.035, 0.24), "window")
    shape.box((0.025, 0.08, 0.44), (x, y - 0.046, 0.24), "light")
    shape.box((width + 0.20, 0.36, 0.07), (x, y - 0.11, 0.52), "trim", 0.013)
    shape.box((width + 0.12, 0.24, 0.05), (x, y - 0.10, 0.025), "light")


def residential_slab():
    shape = Shape()
    facade(shape, 3.8, 2.3, 4.0, floors=5, bays=6)
    for x in (-1.16, 1.16):
        shape.box((0.13, 2.34, 4.0), (x, 0, 2.0), "light")
        entrance(shape, x, -1.15)
    for z in (0.92, 1.68, 2.44, 3.20):
        shape.box((3.82, 2.32, 0.028), (0, 0, z), "trim")
    shape.box((0.80, 0.65, 0.24), (-0.50, 0.30, 4.21), "trim", 0.025)
    for x in (0.75, 1.15):
        shape.box((0.25, 0.30, 0.15), (x, 0.45, 4.17), "light")
    shape.normalize(building=True)
    return shape


def residential_tower():
    shape = Shape()
    facade(shape, 2.5, 2.5, 6.0, floors=8, bays=4)
    shape.box((2.72, 2.72, 0.38), (0, 0, 0.19), "trim", 0.025)
    for x in (-1.22, 1.22):
        for y in (-1.22, 1.22):
            shape.box((0.15, 0.15, 6.0), (x, y, 3.0), "light")
    entrance(shape, 0, -1.36, 0.65)
    shape.box((1.55, 1.55, 0.35), (0, 0, 6.22), "trim", 0.035)
    shape.box((1.67, 1.67, 0.09), (0, 0, 6.43), "light", 0.015)
    shape.box((0.50, 0.60, 0.12), (0, 0, 6.53), "roof")
    shape.normalize(building=True)
    return shape


def residential_courtyard():
    shape = Shape()
    facade(shape, 3.6, 1.12, 3.0, floors=4, bays=6, center=(0, 1.15))
    for x in (-1.22, 1.22):
        facade(shape, 1.16, 2.24, 2.7, floors=3, bays=2, center=(x, -0.52))
        entrance(shape, x, -1.64, 0.43)
        shape.box((0.43, 0.47, 0.19), (x, 0.14, 2.86), "trim", 0.02)
    shape.box((0.66, 0.47, 0.20), (0.70, 1.21, 3.20), "trim", 0.02)
    shape.normalize(building=True)
    return shape


def tree():
    shape = Shape()
    shape.cylinder(0.14, 0.07, (0, 0, 0.035), "bark", sides=8, top=0.12)
    shape.cylinder(0.065, 0.89, (0, 0, 0.48), "bark", sides=7, top=0.035)
    for end in ((-0.27, 0, 1.13), (0.25, 0.16, 1.19), (0.03, -0.20, 1.26)):
        shape.branch((0, 0, 0.60), end, 0.025, "bark")
    shape.crown((-0.21, 0.015, 1.05), (0.32, 0.38, 0.38), "leaf_dark", 0.22)
    shape.crown((0.18, 0.065, 1.15), (0.35, 0.36, 0.39), "leaf", -0.41)
    shape.crown((0.025, -0.09, 1.34), (0.32, 0.33, 0.29), "leaf_light", 0.55)
    shape.normalize()
    return shape


def bus_shelter():
    shape = Shape()
    shape.box((1.40, 0.70, 0.06), (0, 0, 0.03), "trim", 0.016)
    for x in (-0.59, 0.59):
        for y in (-0.20, 0.24):
            shape.box((0.038, 0.038, 0.86), (x, y, 0.49), "steel")
    shape.box((1.28, 0.044, 0.66), (0, 0.26, 0.57), "glass")
    for x in (-0.40, 0.12):
        shape.box((0.022, 0.024, 0.70), (x, 0.228, 0.57), "steel")
    shape.box((0.045, 0.40, 0.65), (-0.60, 0.015, 0.58), "glass")
    shape.box((1.40, 0.70, 0.08), (0, 0, 0.95), "blue", 0.023)
    shape.box((1.28, 0.025, 0.032), (0, -0.352, 0.95), "light")
    shape.box((0.69, 0.19, 0.045), (-0.17, 0.06, 0.32), "wood", 0.008)
    shape.box((0.69, 0.035, 0.13), (-0.17, 0.15, 0.44), "wood", 0.008)
    for x in (-0.42, 0.08):
        shape.box((0.032, 0.13, 0.23), (x, 0.06, 0.175), "steel")
    shape.box((0.24, 0.07, 0.60), (0.43, 0.19, 0.49), "steel", 0.008)
    shape.box((0.19, 0.008, 0.49), (0.43, 0.149, 0.52), "cream")
    shape.box((0.13, 0.008, 0.10), (0.43, 0.14, 0.66), "blue")
    for z in (0.48, 0.43, 0.38):
        shape.box((0.11, 0.008, 0.012), (0.43, 0.14, z), "trim")
    shape.normalize()
    return shape


def civic_building():
    shape = Shape()
    shape.box((1.70, 1.30, 0.08), (0, 0, 0.04), "trim", 0.015)
    shape.box((1.54, 1.10, 1.32), (0, 0.02, 0.72), "cream", 0.025)
    shape.box((1.65, 1.20, 0.10), (0, 0.02, 1.40), "light", 0.013)
    shape.box((1.50, 1.06, 0.035), (0, 0.02, 1.465), "blue")
    shape.box((0.53, 0.55, 0.38), (0, 0.16, 1.68), "cream", 0.015)
    shape.box((0.63, 0.65, 0.07), (0, 0.16, 1.865), "blue", 0.015)
    for x in (-0.53, 0, 0.53):
        for z in (0.53, 1.05):
            shape.box((0.30, 0.012, 0.29), (x, -0.537, z), "blue")
            shape.box((0.02, 0.02, 0.29), (x, -0.55, z), "light")
    for side in (-1, 1):
        for y in (-0.30, 0.28):
            shape.box((0.012, 0.32, 0.59), (side * 0.777, y, 0.88), "blue")
    shape.box((0.36, 0.07, 0.48), (0, -0.555, 0.31), "steel")
    shape.box((0.024, 0.09, 0.46), (0, -0.57, 0.31), "light")
    shape.box((0.68, 0.25, 0.06), (0, -0.525, 0.60), "blue", 0.01)
    shape.box((0.48, 0.26, 0.05), (0, -0.52, 0.10), "light")
    shape.box((0.23, 0.025, 0.07), (0, -0.13, 1.70), "blue")
    shape.box((0.07, 0.025, 0.23), (0, -0.131, 1.70), "blue")
    shape.normalize()
    return shape


def streetlight():
    shape = Shape()
    shape.cylinder(0.15, 0.08, (0, 0, 0.04), "trim", sides=8)
    shape.cylinder(0.078, 0.27, (0, 0, 0.215), "steel", sides=8, top=0.06)
    shape.cylinder(0.042, 1.78, (0, 0, 1.20), "steel", sides=8, top=0.028)
    shape.branch((0, 0, 1.84), (0.37, 0, 2.10), 0.028, "steel")
    shape.box((0.40, 0.18, 0.09), (0.38, 0, 2.155), "steel", 0.018)
    shape.box((0.31, 0.13, 0.018), (0.40, 0, 2.101), "warm")
    shape.box((0.10, 0.065, 0.16), (-0.005, -0.043, 0.45), "trim", 0.009)
    shape.normalize()
    return shape


def utility_cover():
    shape = Shape()
    shape.cylinder(0.45, 0.09, (0, 0, 0.045), "trim", sides=20)
    shape.cylinder(0.39, 0.045, (0, 0, 0.1125), "steel", sides=20)
    shape.cylinder(0.35, 0.015, (0, 0, 0.1425), "trim", sides=20)
    for x in (-0.22, -0.11, 0, 0.11, 0.22):
        length = 2 * math.sqrt(0.31 ** 2 - x ** 2)
        shape.box((0.026, length, 0.004), (x, 0, 0.149), "steel")
    for x in (-0.29, 0.29):
        shape.box((0.075, 0.024, 0.004), (x, 0, 0.15), "window")
    shape.normalize()
    return shape


BUILDERS = {
    "residential-slab": residential_slab,
    "residential-tower": residential_tower,
    "residential-courtyard": residential_courtyard,
    "tree": tree,
    "bus-shelter": bus_shelter,
    "civic-building": civic_building,
    "streetlight": streetlight,
    "utility-cover": utility_cover,
}


def material():
    result = bpy.data.materials.new("city-vertex-color")
    result.use_nodes = True
    result.diffuse_color = (1, 1, 1, 1)
    bsdf = result.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 0.86
    bsdf.inputs["Metallic"].default_value = 0
    color = result.node_tree.nodes.new("ShaderNodeVertexColor")
    color.layer_name = "Color"
    result.node_tree.links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
    return result


def export(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Имена параметров цвета изменились в новых версиях встроенного glTF-экспортёра.
    supported = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    options = {"filepath": str(OUTPUT / (obj.name + ".glb")), "export_format": "GLB",
               "use_selection": True, "export_apply": True, "export_yup": True,
               "export_animations": False, "export_texcoords": False,
               "export_normals": True, "export_tangents": False,
               "export_materials": "EXPORT", "export_extras": False}
    if "export_colors" in supported:
        options["export_colors"] = True
    if "export_vertex_color" in supported:
        options["export_vertex_color"] = "ACTIVE"
    bpy.ops.export_scene.gltf(**options)


def validate(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2 and length == len(data), path.name
    json_length, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A
    document = json.loads(data[20:20 + json_length])
    assert len(document["scenes"]) == 1 and document["scenes"][0]["nodes"] == [0]
    assert len(document["meshes"]) == 1 and len(document["nodes"]) == 1
    assert len(document["materials"]) == 1 and len(document["buffers"]) == 1
    assert "uri" not in document["buffers"][0]
    assert not any(document.get(key) for key in ("textures", "images", "animations", "skins"))
    assert not document.get("extensionsRequired")
    node = document["nodes"][0]
    assert not any(key in node for key in ("matrix", "translation", "rotation", "scale"))
    primitive, = document["meshes"][0]["primitives"]
    assert "COLOR_0" in primitive["attributes"] and "NORMAL" in primitive["attributes"]
    assert primitive.get("mode", 4) == 4 and not primitive.get("extensions")
    mat, = document["materials"]
    assert mat.get("alphaMode", "OPAQUE") == "OPAQUE"
    assert mat["pbrMetallicRoughness"].get("metallicFactor", 1) == 0
    assert abs(mat["pbrMetallicRoughness"].get("roughnessFactor", 1) - 0.86) < 1e-5
    position = document["accessors"][primitive["attributes"]["POSITION"]]
    low, high = position["min"], position["max"]
    assert abs(low[1]) < 1e-6, (path.name, low)
    assert abs(low[0] + high[0]) < 1e-6 and abs(low[2] + high[2]) < 1e-6
    if path.stem.startswith("residential"):
        assert abs(high[1] - 1) < 1e-6
        assert high[0] - low[0] <= 1.000001 and high[2] - low[2] <= 1.000001
    return {"file": path.name, "bytes": len(data),
            "triangles": document["accessors"][primitive["indices"]]["count"] // 3,
            "vertices": position["count"], "min": low, "max": high}


def preview(objects):
    scene = bpy.context.scene
    for index, obj in enumerate(objects):
        obj.location = ((index % 4 - 1.5) * 3.2, (1 - index // 4) * 4.0, 0.12)
        if index < 3:
            obj.scale = (2.0, 2.0, (2.20, 3.05, 1.85)[index])
        elif index == 3:
            obj.scale = (1.35,) * 3
        elif index in (4, 7):
            obj.scale = (1.4,) * 3
        plate = Shape()
        plate.box((2.78, 2.75, 0.12), (obj.location.x, obj.location.y, 0.06), (0.85, 0.87, 0.86), 0.07)
        plate.object("preview-base", objects[0].data.materials[0])
    floor = Shape()
    floor.box((200, 200, 0.05), (0, 0, -0.08), (0.91, 0.92, 0.91))
    floor.object("preview-floor", objects[0].data.materials[0])
    camera_data = bpy.data.cameras.new("preview-camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 15.5
    camera = bpy.data.objects.new("preview-camera", camera_data)
    scene.collection.objects.link(camera)
    target = Vector((0, 2.0, 0.75))
    direction = Vector((0.38, -0.78, 0.71)).normalized()
    camera.location = target + direction * 24
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    for name, position, energy, size in (("key", (-3, -4, 10), 1700, 8),
                                         ("fill", (8, 3, 8), 1050, 7)):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.shape, light.size = energy, "DISK", size
        obj = bpy.data.objects.new(name, light)
        obj.location = position
        obj.rotation_euler = (Vector((0, 2, 0)) - obj.location).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(obj)
    world = bpy.data.worlds.new("preview-world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.88, 0.96, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.65
    scene.world = world
    # Cycles CPU работает без графического окна и не зависит от EEVEE-Legacy.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.cycles.seed = 0
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1060
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(OUTPUT / "preview.png")
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-preview", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    shared_material = material()
    objects, report = [], []
    for name, builder in BUILDERS.items():
        obj = builder().object(name, shared_material)
        export(obj)
        objects.append(obj)
        report.append(validate(OUTPUT / (name + ".glb")))
    total = sum(item["bytes"] for item in report)
    assert total < 500_000, total
    (OUTPUT / "manifest.json").write_text(json.dumps({"totalBytes": total, "models": report},
                                                     ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"totalBytes": total, "models": report}, ensure_ascii=True))
    if not args.skip_preview:
        preview(objects)


if __name__ == "__main__":
    main()
