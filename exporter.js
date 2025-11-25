import * as THREE from 'three';
import {
    IfcAPI, IFCPROJECT, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY,
    IFCCOLUMN, IFCBEAM, IFCFOOTING, IFCMEMBER, IFCMECHANICALFASTENER, IFCBUILDINGELEMENTPROXY, IFCWALL,
    IFCRELAGGREGATES, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELDEFINESBYPROPERTIES,
    IFCEXTRUDEDAREASOLID, IFCRECTANGLEPROFILEDEF, IFCAXIS2PLACEMENT3D, IFCDIRECTION, IFCCARTESIANPOINT, IFCLOCALPLACEMENT,
    IFCPROPERTYSET, IFCPROPERTYSINGLEVALUE,
    IFCIDENTIFIER, IFCLABEL, IFCTEXT, IFCREAL, IFCLENGTHMEASURE,
    IFCUNITASSIGNMENT, IFCUNIT, IFCSIUNIT, IFCMEASUREWITHUNIT,
    IFCPRODUCTDEFINITIONSHAPE, IFCSHAPEREPRESENTATION, IFCGEOMETRICREPRESENTATIONCONTEXT
} from 'https://unpkg.com/web-ifc@0.0.53/web-ifc-api.js';

const ifcApi = new IfcAPI();
ifcApi.SetWasmPath("https://unpkg.com/web-ifc@0.0.53/");

let modelID = 0;

export async function exportIFC(scene) {
    console.log("Starting IFC Export...");
    await ifcApi.Init();
    modelID = ifcApi.CreateModel();

    // 1. Project Structure
    const { projectID, siteID, buildingID, storeyID } = createProjectHierarchy();

    // 2. Context (Required for Geometry)
    const context = createGeometricContext();

    // 3. Elements
    const bridgeElements = [];
    let bridgeGroup = null;
    scene.traverse(child => {
        if (child.isGroup && child.children.length > 0 && child.children[0].userData && child.children[0].userData.ID) {
            bridgeGroup = child;
        }
    });
    if (!bridgeGroup) bridgeGroup = scene;

    bridgeGroup.traverse(child => {
        if (child.isMesh && child.visible) {
            const ifcProduct = createIfcProductFromMesh(child, context);
            if (ifcProduct) {
                bridgeElements.push(ifcProduct);
            }
        }
    });

    // 4. Link to Storey
    const relContained = ifcApi.CreateIfcEntity(modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE, [
        ifcApi.CreateIfcGUID(), null,
        ifcApi.CreateIfcEntity(modelID, IFCLABEL, "StoreyContainer"), null,
        [ifcApi.CreateIfcEntity(modelID, IFCLABEL, "StoreyContainer")],
        ifcApi.CreateIfcEntity(modelID, IFCBUILDINGSTOREY, storeyID),
        bridgeElements.map(el => ifcApi.CreateIfcEntity(modelID, el.type, el.id))
    ]);
    ifcApi.WriteLine(modelID, relContained);

    // 5. Save
    const data = ifcApi.SaveModel(modelID);
    const blob = new Blob([data], { type: "application/ifc" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = "ponte_generato.ifc";
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ifcApi.CloseModel(modelID);
}

function createProjectHierarchy() {
    const unitAssignment = ifcApi.CreateIfcEntity(modelID, IFCUNITASSIGNMENT, [
        ifcApi.CreateIfcEntity(modelID, IFCSIUNIT, [null, ifcApi.CreateIfcEntity(modelID, IFCUNIT, 0), null, ifcApi.CreateIfcEntity(modelID, IFCSIUNIT, 0)]) // Length (Meters)
    ]);
    ifcApi.WriteLine(modelID, unitAssignment);

    const project = ifcApi.CreateIfcEntity(modelID, IFCPROJECT, [
        ifcApi.CreateIfcGUID(), null, ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Bridge Project"), null, null, null, null, null,
        ifcApi.CreateIfcEntity(modelID, IFCUNITASSIGNMENT, unitAssignment)
    ]);
    ifcApi.WriteLine(modelID, project);

    const site = ifcApi.CreateIfcEntity(modelID, IFCSITE, [
        ifcApi.CreateIfcGUID(), null, ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Site"), null, null, null, null, null,
        ifcApi.CreateIfcEntity(modelID, IFCBUILDINGELEMENTPROXY, 0), null, null, null, null, null
    ]);
    ifcApi.WriteLine(modelID, site);

    const building = ifcApi.CreateIfcEntity(modelID, IFCBUILDING, [
        ifcApi.CreateIfcGUID(), null, ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Building"), null, null, null, null, null,
        ifcApi.CreateIfcEntity(modelID, IFCBUILDINGELEMENTPROXY, 0), null, null, null
    ]);
    ifcApi.WriteLine(modelID, building);

    const storey = ifcApi.CreateIfcEntity(modelID, IFCBUILDINGSTOREY, [
        ifcApi.CreateIfcGUID(), null, ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Storey"), null, null, null, null, null,
        ifcApi.CreateIfcEntity(modelID, IFCBUILDINGELEMENTPROXY, 0), null, ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, 0.0)
    ]);
    ifcApi.WriteLine(modelID, storey);

    createRelAggregates(project, site);
    createRelAggregates(site, building);
    createRelAggregates(building, storey);

    return { projectID: project, siteID: site, buildingID: building, storeyID: storey };
}

function createRelAggregates(parent, child) {
    const rel = ifcApi.CreateIfcEntity(modelID, IFCRELAGGREGATES, [
        ifcApi.CreateIfcGUID(), null, null, null,
        ifcApi.CreateIfcEntity(modelID, parent.type, parent),
        [ifcApi.CreateIfcEntity(modelID, child.type, child)]
    ]);
    ifcApi.WriteLine(modelID, rel);
}

function createGeometricContext() {
    // Model Context
    const context = ifcApi.CreateIfcEntity(modelID, IFCGEOMETRICREPRESENTATIONCONTEXT, [
        ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Model"),
        ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Model"),
        ifcApi.CreateIfcEntity(modelID, 3, 3), // Dimension
        ifcApi.CreateIfcEntity(modelID, IFCREAL, 1e-5), // Precision
        ifcApi.CreateIfcEntity(modelID, IFCAXIS2PLACEMENT3D, [
            ifcApi.CreateIfcEntity(modelID, IFCCARTESIANPOINT, [ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, 0), ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, 0), ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, 0)]),
            null, null
        ]),
        null
    ]);
    ifcApi.WriteLine(modelID, context);
    return context;
}

function createIfcProductFromMesh(mesh, context) {
    let type = IFCBUILDINGELEMENTPROXY;
    const name = mesh.name || "Unknown";

    if (name.includes("Pila") || name.includes("Montante")) type = IFCCOLUMN;
    else if (name.includes("Trave") || name.includes("Traverso") || name.includes("Impalcato")) type = IFCBEAM;
    else if (name.includes("Fondazione") || name.includes("Plinto")) type = IFCFOOTING;
    else if (name.includes("Appoggio")) type = IFCMECHANICALFASTENER;
    else if (name.includes("Arco")) type = IFCMEMBER;
    else if (name.includes("Spalla")) type = IFCWALL;

    // Geometry
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    mesh.geometry.boundingBox.getSize(size);
    size.multiply(mesh.scale);

    // Profile (X-Z plane for vertical extrusion?)
    // Standard Extrusion: Profile in XY, Extruded in Z.
    // We want a box width(X) * depth(Z) * height(Y).
    // So Profile = Rectangle(X, Z). Extrusion = Y.
    const profile = ifcApi.CreateIfcEntity(modelID, IFCRECTANGLEPROFILEDEF, [
        ifcApi.CreateIfcEntity(modelID, 0, 0), // AREA
        null,
        ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Rect"),
        ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, size.x),
        ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, size.z)
    ]);
    ifcApi.WriteLine(modelID, profile);

    const placement = ifcApi.CreateIfcEntity(modelID, IFCAXIS2PLACEMENT3D, [
        ifcApi.CreateIfcEntity(modelID, IFCCARTESIANPOINT, [ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, 0), ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, 0), ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, 0)]),
        null, null
    ]);
    ifcApi.WriteLine(modelID, placement);

    const solid = ifcApi.CreateIfcEntity(modelID, IFCEXTRUDEDAREASOLID, [
        profile,
        placement,
        ifcApi.CreateIfcEntity(modelID, IFCDIRECTION, [ifcApi.CreateIfcEntity(modelID, IFCREAL, 0), ifcApi.CreateIfcEntity(modelID, IFCREAL, 1), ifcApi.CreateIfcEntity(modelID, IFCREAL, 0)]), // UP
        ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, size.y)
    ]);
    ifcApi.WriteLine(modelID, solid);

    const shapeRep = ifcApi.CreateIfcEntity(modelID, IFCSHAPEREPRESENTATION, [
        context,
        ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Body"),
        ifcApi.CreateIfcEntity(modelID, IFCLABEL, "SweptSolid"),
        [solid]
    ]);
    ifcApi.WriteLine(modelID, shapeRep);

    const productDefShape = ifcApi.CreateIfcEntity(modelID, IFCPRODUCTDEFINITIONSHAPE, [
        null, null, [shapeRep]
    ]);
    ifcApi.WriteLine(modelID, productDefShape);

    // Placement
    const pos = mesh.position;
    const q = mesh.quaternion;
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const e = matrix.elements;

    const location = ifcApi.CreateIfcEntity(modelID, IFCCARTESIANPOINT, [
        ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, pos.x),
        ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, pos.y - size.y / 2), // Bottom center
        ifcApi.CreateIfcEntity(modelID, IFCLENGTHMEASURE, pos.z)
    ]);
    ifcApi.WriteLine(modelID, location);

    const axisZ = ifcApi.CreateIfcEntity(modelID, IFCDIRECTION, [
        ifcApi.CreateIfcEntity(modelID, IFCREAL, e[8]), ifcApi.CreateIfcEntity(modelID, IFCREAL, e[9]), ifcApi.CreateIfcEntity(modelID, IFCREAL, e[10])
    ]);
    ifcApi.WriteLine(modelID, axisZ);

    const axisX = ifcApi.CreateIfcEntity(modelID, IFCDIRECTION, [
        ifcApi.CreateIfcEntity(modelID, IFCREAL, e[0]), ifcApi.CreateIfcEntity(modelID, IFCREAL, e[1]), ifcApi.CreateIfcEntity(modelID, IFCREAL, e[2])
    ]);
    ifcApi.WriteLine(modelID, axisX);

    const localPlacement = ifcApi.CreateIfcEntity(modelID, IFCAXIS2PLACEMENT3D, [location, axisZ, axisX]);
    ifcApi.WriteLine(modelID, localPlacement);

    const productPlacement = ifcApi.CreateIfcEntity(modelID, IFCLOCALPLACEMENT, [null, localPlacement]);
    ifcApi.WriteLine(modelID, productPlacement);

    // Product
    const product = ifcApi.CreateIfcEntity(modelID, type, [
        ifcApi.CreateIfcGUID(), null, ifcApi.CreateIfcEntity(modelID, IFCLABEL, name), null,
        ifcApi.CreateIfcEntity(modelID, IFCLABEL, name),
        productPlacement,
        productDefShape,
        ifcApi.CreateIfcEntity(modelID, IFCIDENTIFIER, mesh.userData.ID || name)
    ]);
    ifcApi.WriteLine(modelID, product);

    // Properties
    if (mesh.userData) {
        const props = [];
        for (const [key, value] of Object.entries(userData)) {
            const prop = ifcApi.CreateIfcEntity(modelID, IFCPROPERTYSINGLEVALUE, [
                ifcApi.CreateIfcEntity(modelID, IFCLABEL, key), null,
                ifcApi.CreateIfcEntity(modelID, IFCTEXT, String(value)), null
            ]);
            ifcApi.WriteLine(modelID, prop);
            props.push(prop);
        }
        const pset = ifcApi.CreateIfcEntity(modelID, IFCPROPERTYSET, [
            ifcApi.CreateIfcGUID(), null, ifcApi.CreateIfcEntity(modelID, IFCLABEL, "Pset_BridgeCommon"), null, props
        ]);
        ifcApi.WriteLine(modelID, pset);
        const relDefines = ifcApi.CreateIfcEntity(modelID, IFCRELDEFINESBYPROPERTIES, [
            ifcApi.CreateIfcGUID(), null, null, null, [product], pset
        ]);
        ifcApi.WriteLine(modelID, relDefines);
    }

    return { type: type, id: product };
}
