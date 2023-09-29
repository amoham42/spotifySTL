import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let scene, camera, renderer, exporter, code, loader;
const params = {exportBinary: exportBinary, 'sptLink': '', lnk: lnk, Manual: Manual};
let address = 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M';
let update = 24;
let base;
init();
animate();

function init() {
    code = new THREE.Group();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(40, 100, 100);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);
    exporter = new STLExporter();

    // LIGHTS

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
    directionalLight.position.set(0, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.top = 2;
    directionalLight.shadow.camera.bottom = - 2;
    directionalLight.shadow.camera.left = - 2;
    directionalLight.shadow.camera.right = 2;
    scene.add(directionalLight);

    // GROUND & GRID

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshPhongMaterial({color: 0x000000, depthWrite: false}));
    ground.position.x = 30;
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(400, 50, 0xbbbbbb, 0xbbbbbb);
    grid.position.x = 30;
    grid.material.opacity = 0.6;
    grid.material.transparent = true;
    scene.add(grid);

    // KEYCHAIN FILE
    
    var objloader = new OBJLoader();
    objloader.load('files/keychain.obj', function (object) {
        object.rotation.set(-Math.PI / 2, 0, 0);
        object.children[0].parent = null;
        code.add(object.children[0]);
        code.children[0].scale.set(7, 7, 7);
        code.children[0].position.set(-87, -3, -14);
        base = code.children[0];
    });
    
    // SVG FILE
    loader = new SVGLoader();
    loader.load('files/spot.svg',spot);

    // RENDERER

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // CONTROLS

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(40, 0, -5);
    controls.update();

    // GUI

    window.addEventListener('resize', onWindowResize);
    const gui = new GUI({width: 500});
    gui.add(params, 'Manual').name('Manual');
    gui.add(params, 'sptLink').name('Spotify Link (YOUR LINK HERE) =========>').onChange(function (value){
        address = parseText(value);
    });
    gui.add(params, 'lnk').name('Add Link');
    gui.add(params, 'exportBinary').name('Export STL');
    
    
    gui.open();

}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

}

function animate() {

    requestAnimationFrame(animate);
    renderer.render(scene, camera);

}

function spot (data) {
    
    
    const paths = data.paths;
    code.scale.set(0.14, -0.14, 0.14);
    code.position.set(13, 2, -14.5);
    code.rotation.set(-Math.PI / 2, 0, 0);

    for (let i = update; i < paths.length; i++) {

        const path = paths[i];
        const material = new THREE.MeshPhongMaterial({color: 0x1ED760});
        const shapes = SVGLoader.createShapes(path);

        for (let j = 0; j < shapes.length; j++) {

            const shape = shapes[j];
            const geometry = new THREE.ExtrudeGeometry(shape, {depth: 7, bevelEnabled: false});
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            code.add(mesh);

        }
        update = 1;
    }
    
    scene.add(code);
}

function exportBinary() {
    
    const result = exporter.parse(code, {binary: true});
    saveArrayBuffer(result, 'keychain.stl');

}

function lnk() {
    
    fetch('https://scannables.scdn.co/uri/plain/svg/FFFFFF/black/640/' + address)
  .then(res => res.blob())
  .then(blob => {
    let objectURL = URL.createObjectURL(blob);
    loader = new SVGLoader();
    code = new THREE.Group();
    code.add(base);
    loader.load(objectURL, spot);
    });

}

function Manual() {
    window.open('https://github.com/amoham42/spotifySTL/blob/main/README.md');
}

function parseText(text) {
    var lst = text.split('/');
    if(lst[2] != 'open.spotify.com'){
        return '';
    } else {
        return 'spotify:' + lst[3] + ':' + lst[4];
    }
}

const link = document.createElement('a');
link.style.display = 'none';
document.body.appendChild(link);

function save(blob, filename) {

    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

}

function saveArrayBuffer(buffer, filename) {

    save(new Blob([buffer], {type: 'application/octet-stream'}), filename);

}