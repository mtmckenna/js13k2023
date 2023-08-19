import {Joystick } from "./joystick";
import { KeyboardInput} from "./keyboard_input";
import {
    calculateAngle,
    distanceBetweenPoints, getCos, getSin, midpointOfEdge, normalFromVector,
    normalizeVector, perpendicularDistanceFromPointToEdge,
    randomFloat, randomIndex,
    vectorFromEdge
} from "./math";
import {circlesCollide, findCollisions} from "./collision";
import {
    IPoint,
    IVehicleInputState,
    IEdge, ICollision, IBuilding, CanvasColor, IPolygon,
} from "./interfaces";
import {
    edgesFromPolygon, polygonFromEdges,
    roadsAndRegionsFromPoints,
    shrinkPolygon,
    subdivideRegions,
} from "./level_generation";
import Grid, {indexForPos} from "./grid";
import Enemy from "./enemy";

// import {EXAMPLE_POINTS} from "./debug";

import { FpsDisplay, DEBUG } from "./debug";
import {ROAD_WIDTH} from "./road";
import Camera from "./camera";
import {BulletPool, PointPool} from "./pools";
import Boat from "./boat";
import {updatePos} from "./game_objects";

const canvas: HTMLCanvasElement = document.createElement("canvas");
const ctx: CanvasRenderingContext2D = canvas.getContext("2d");
const grid = new Grid();
const menu: HTMLElement = document.querySelector(".menu-container");

canvas.id = "game";
canvas.width = 1000
canvas.height = 1000;
const GRID_SCALE = 1/2;

const camera = new Camera({x: 0, y: 0}, 1.25, 1, {x: canvas.width, y: canvas.height}, grid.gameSize, GRID_SCALE);

const NUM_POINTS = 100;
const NUM_ENEMIES = 1;
const MAX_POINT_TRIES = 10;
const MIN_POINT_DIST = ROAD_WIDTH * 2;
const MAX_DIMENSION = 1000;

export const MAX_COLLISIONS = 25
const FIXED_TIMESTEP = 1 / 60;  // fixed timestep of 60 FPS
let accumulator = 0;  // accumulates elapsed time
let lastTime = performance.now();
const roadCollisions: IEdge[] = []
const regionCollisions: ICollision[] = []
let numRegionCollisions = 0;
let cash = 0;

for (let i = 0; i < MAX_COLLISIONS; i++) {
    roadCollisions[i] = {v0: {x: 0, y: 0}, v1: {x: 0, y: 0}};
}

for (let i = 0; i < MAX_COLLISIONS; i++) {
    regionCollisions[i] = {edge: { v0: {x: 0, y: 0}, v1: {x: 0, y: 0}}, depth: 0};
}

const div = document.createElement("div");
div.appendChild(canvas);
document.body.prepend(canvas);

const gridCanvas = document.createElement('canvas');
const gridCtx = gridCanvas.getContext('2d');
const buildingsCanvas = document.createElement('canvas');
const buildingsCtx = buildingsCanvas.getContext('2d');
const regionsCanvas = document.createElement('canvas');
const groundCanvas: HTMLCanvasElement = document.createElement("canvas");
const groundCtx: CanvasRenderingContext2D = groundCanvas.getContext("2d");
const airCanvas: HTMLCanvasElement = document.createElement("canvas");
const airCtx: CanvasRenderingContext2D = airCanvas.getContext("2d");
gridCanvas.width = grid.gameSize.x*GRID_SCALE;
gridCanvas.height = grid.gameSize.y*GRID_SCALE;
buildingsCanvas.width = grid.gameSize.x*GRID_SCALE;
buildingsCanvas.height = grid.gameSize.y*GRID_SCALE;
regionsCanvas.width = grid.gameSize.x*GRID_SCALE;
regionsCanvas.height = grid.gameSize.y*GRID_SCALE;
groundCanvas.width = grid.gameSize.x*GRID_SCALE;
groundCanvas.height = grid.gameSize.y*GRID_SCALE;
airCanvas.width = grid.gameSize.x*GRID_SCALE;
airCanvas.height = grid.gameSize.y*GRID_SCALE;

BulletPool.gameSize = grid.gameSize;
BulletPool.grid = grid;
BulletPool.initialize(1000);

let fpsDisplay = null;
if (DEBUG) fpsDisplay = new FpsDisplay();

const joystick = new Joystick(canvas, joystickMoveCallback, doubleTapCallback);
const keyboard = new KeyboardInput(window, keyCallback);
const playerInputState: IVehicleInputState = { pos: { x:0, y:0 }, mode: "kb" };
let points: IPoint[] = [];
let enemies: Enemy[] = [];
const UI_STATE = {
    deliveryMenuVisible: false
}

for (let i = 0; i < NUM_POINTS; i++) {
    let tries = 0;
    while (tries < MAX_POINT_TRIES) {
        const p = randomPointWithinBounds(grid.gameSize);
        let tooClose = false;
        for (const point of points) {
            if (distanceBetweenPoints(p, point) < MIN_POINT_DIST) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) {
            const newPoint = randomPointWithinBounds(grid.gameSize);
            p.x = newPoint.x;
            p.y = newPoint.y;
            tries++;
        } else {
            points.push(p);
            break;
        }
    }
}

// points = EXAMPLE_POINTS;

console.log(points);
function randomPointWithinBounds(bounds: IPoint): IPoint {
    return {
        x: randomFloat(0, bounds.x),
        y: randomFloat(0, bounds.y)
    };
}

let { roads, regions } = roadsAndRegionsFromPoints(points, grid.gameSize);
const subdividedRegions = subdivideRegions(regions, grid.gameSize);
const randomRoad = roads[Math.floor(Math.random() * roads.length)];
const randomRoadPoint = randomRoad.center;
const upgrades: { [key: string]: number } = {
    "Fast Sails": 100,
    "Armored Hull": 100,
    "Gun": 100,
}

let buildings: IBuilding[] = [];
// const depotIndex = randomIndex(subdividedRegions);
const depotIndex = subdividedRegions.indexOf(closestRegionToPos(randomRoadPoint, subdividedRegions));
const deliveryIndices: number []= [];
const DROP_OFF_RADIUS = 50;
let circleSize = DROP_OFF_RADIUS * .9 * GRID_SCALE; // Starting size
let sizeDirection = 1; // 1 for increasing, -1 for decreasing
const SIZE_SPEED = 0.25 * GRID_SCALE; // Adjust this to make the pulse faster or slower
const SIZE_MAX = DROP_OFF_RADIUS * .9 * GRID_SCALE; // Maximum size value
const SIZE_MIN = DROP_OFF_RADIUS * .6 * GRID_SCALE; // Minimum size value

for (let i = 0; i < subdividedRegions.length; i++) {
    const region = subdividedRegions[i];
    const regionEdges = edgesFromPolygon(region);
    const shrunkEdges = shrinkPolygon(regionEdges, 10, true, grid.gameSize);
    if (!shrunkEdges) continue;
    const shrunkPolygon = polygonFromEdges(shrunkEdges);

    let minDist = Number.MAX_VALUE;
    let dropOffPoint: IPoint = {x: 0, y: 0};

    for (const edge of regionEdges) {
        for (const road of roads) {
            const midpoint = midpointOfEdge(edge);
            const dist = perpendicularDistanceFromPointToEdge(midpoint, road.edge);
            if (dist && dist < minDist) {
                minDist = dist;
                const normal = {x: 0, y: 0};
                normalFromVector(vectorFromEdge(edge, normal), normal);
                // I think negative because maybe the normal is pointing in the wrong direction?
                dropOffPoint.x = midpoint.x + normal.x * -ROAD_WIDTH/2;
                dropOffPoint.y = midpoint.y + normal.y * -ROAD_WIDTH/2;
            }
        }
    }

    const building: IBuilding = { ...shrunkPolygon, type: "empty", color: "#fff", dropOffPoint };

    if (i === depotIndex) {
        building.type = "depot";
        building.color = "#fff";
    } else if (deliveryIndices.includes(i)) {
        building.type = "delivery";
        building.color = "#fff";
    }

    buildings.push(building);
}

const regionVertices = regions.map(r => r.vertices);
const smallRegions = regions.map(r => shrinkPolygon(edgesFromPolygon(r), 10, true, grid.gameSize)).map(b => polygonFromEdges(b));

const player = new Boat(grid, playerInputState);
grid.setRoads(roads);
grid.setSubregionPolygons(subdividedRegions);
grid.setBuildings(buildings);
grid.setRegions(smallRegions);

const depot = buildings[depotIndex];
updatePos(depot.dropOffPoint.x, depot.dropOffPoint.y, player);
player.angle = randomRoad.angle + Math.PI /2;
//
// for (let i = 0; i < NUM_ENEMIES; i++) {
//     const enemy = new Enemy({x: randomFloat(0, grid.gameSize.x), y: randomFloat(0, grid.gameSize.y)}, grid, player)
//     enemies.push(enemy);
//     grid.addToEnemyMap(enemy);
// }

const enemy = new Enemy({x: player.pos.x, y: player.pos.y}, grid, player)
enemies.push(enemy);
grid.addToEnemyMap(enemy);

const NUM_INTIAL_DELIVERIES = 3;
deliveryIndices.push(...findRegionIndexesWithinDistances(randomRoadPoint, subdividedRegions, NUM_INTIAL_DELIVERIES, 750, 150));

function tick(t: number) {
    let deltaTime = (t - lastTime) / 1000;  // convert to seconds
    lastTime = t;

    // prevent spiral of death (when the frame rate drops below the fixed timestep)
    deltaTime = Math.min(deltaTime, FIXED_TIMESTEP * 5);

    lastTime = t;

    accumulator += deltaTime;

    while (accumulator >= FIXED_TIMESTEP) {
        update(FIXED_TIMESTEP);
        accumulator -= FIXED_TIMESTEP;
        if (DEBUG) fpsDisplay.update(t);
    }
    draw(t)

    requestAnimationFrame(tick);
}
function update(t: number) {
    if (UI_STATE.deliveryMenuVisible) return;
    grid.update();
    for (const enemy of enemies) { enemy.update(t); }

    player.update(t);
    BulletPool.update(t);
    numRegionCollisions = findCollisions(player.vertices, regionVertices, regionCollisions);

    // go through the cells and print out the number of enemies in total
    let num = 0;
    for (let i = 0; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        num += cell.enemies.filter(e => !!e).length;
        // console.log(cell.numEnemies);
    }
    // console.log(num);

    for (let i = 0; i < numRegionCollisions; i++) {
        const collision = regionCollisions[i];

        const collisionEdge = collision.edge;
        const normalizedCollisionEdge = PointPool.get();
        vectorFromEdge(collisionEdge, normalizedCollisionEdge);
        normalizeVector(normalizedCollisionEdge, normalizedCollisionEdge);

        const penetrationDepth = collision.depth;
        player.pos.x -= normalizedCollisionEdge.x * penetrationDepth;
        player.pos.y -= normalizedCollisionEdge.y * penetrationDepth;

        PointPool.release(normalizedCollisionEdge);
        break;
    }

    if (deliveryIndices.length > 0) {
        const { x: x1, y: y1 } = player.center;
        const { radius: r1 } = player;
        const { x: x2, y: y2 } = buildings[deliveryIndices[0]].dropOffPoint;
        const inDropOffRadius = circlesCollide(x1, y1, r1, x2, y2, DROP_OFF_RADIUS);
        if (inDropOffRadius && player.speed < 1) {
            buildings[deliveryIndices[0]].type = "empty";
            buildings[deliveryIndices[0]].color = "#fff";
            grid.drawBuilding(buildingsCtx, buildings[deliveryIndices[0]], GRID_SCALE, "#fff");
            updateCash(100);
            deliveryIndices.shift();
            if (deliveryIndices.length > 0) {
                buildings[deliveryIndices[0]].color = "red";
                grid.drawBuilding(buildingsCtx, buildings[deliveryIndices[0]], GRID_SCALE, "red");
            } else {
                // buildings[depotIndex].color = "green";
                // grid.drawBuilding(buildingsCtx, buildings[depotIndex], GRID_SCALE, "green");
            }
        }

        buildings[depotIndex].color = "#fff";
        grid.drawBuilding(buildingsCtx, buildings[depotIndex], GRID_SCALE, "#fff");
    } else {
        const { x: x1, y: y1 } = player.center;
        const { radius: r1 } = player;
        const { x: x2, y: y2 } = buildings[depotIndex].dropOffPoint;
        const inDropOffRadius = circlesCollide(x1, y1, r1, x2, y2, DROP_OFF_RADIUS);
        if (inDropOffRadius && player.speed < 1) {
            if (!UI_STATE.deliveryMenuVisible) showMenu();
        }

        buildings[depotIndex].color = "green";
        grid.drawBuilding(buildingsCtx, buildings[depotIndex], GRID_SCALE, "green");
    }

    camera.centerOn(player, FIXED_TIMESTEP); // Update the camera to center on the player.


}

function draw(t: number) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    groundCtx.clearRect(0, 0, groundCanvas.width, groundCanvas.height);
    groundCtx.imageSmoothingEnabled = false;
    airCtx.clearRect(0, 0, airCanvas.width, airCanvas.height);
    airCtx.imageSmoothingEnabled = false;

    const sourceX = camera.pos.x * GRID_SCALE;
    const sourceY = camera.pos.y * GRID_SCALE ;
    const sourceWidth = camera.canvasSize.x * GRID_SCALE / camera.currentZoom
    const sourceHeight = camera.canvasSize.y * GRID_SCALE / camera.currentZoom;

    const destX = 0;
    const destY = 0;
    const destWidth = camera.canvasSize.x;
    const destHeight = camera.canvasSize.y;

    ctx.drawImage(gridCanvas, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);

    // Logic to pulse circle size
    circleSize += SIZE_SPEED * sizeDirection;
    if (circleSize > SIZE_MAX || circleSize < SIZE_MIN) sizeDirection *= -1; // Reverse direction

    groundCtx.globalAlpha = .5; // Apply alpha transparency
    groundCtx.fillStyle = "green";
    let building = buildings[depotIndex];
    if (deliveryIndices.length > 0) {
        groundCtx.fillStyle = "red";
        building = buildings[deliveryIndices[0]];
    }
    groundCtx.beginPath();
    groundCtx.arc(building.dropOffPoint.x * GRID_SCALE, building.dropOffPoint.y * GRID_SCALE, circleSize, 0, 2 * Math.PI);
    groundCtx.fill();
    groundCtx.globalAlpha = 1; // Reset alpha

    player.draw(groundCtx, GRID_SCALE); // Assuming player's draw method uses the passed context.

    ctx.drawImage(groundCanvas, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
    ctx.drawImage(buildingsCanvas, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);

    for (const enemy of enemies) { enemy.draw(airCtx, GRID_SCALE, t); }

    BulletPool.draw(airCtx, GRID_SCALE);

    if (deliveryIndices.length > 0) {
        drawArrowToBuilding(airCtx, player.center, buildings[deliveryIndices[0]]);
    } else {
        drawArrowToBuilding(airCtx, player.center, buildings[depotIndex]);
    }

    airCtx.fillStyle = "#000";
    ctx.drawImage(airCanvas, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);

    joystick.draw(ctx);

}
function updateCash(amount: number) {
    cash += amount;
    const cashElement = document.querySelector('#cash');
    cashElement.innerHTML = `$${cash}`;
}

function drawArrowToBuilding(ctx: CanvasRenderingContext2D, center: IPoint, building: IBuilding) {
    // const angle = calculateAngle(center.x, center.y, building.center.x, building.center.y) + Math.PI / 2;
    const angle = calculateAngle(center.x, center.y, building.dropOffPoint.x, building.dropOffPoint.y) + Math.PI / 2;

    const TRIANGLE_SIZE = 10;
    const RADIUS_AROUND_PLAYER = player.radius + TRIANGLE_SIZE * 2.5;

    const cos = getCos(angle - Math.PI/2);
    const sin = getSin(angle - Math.PI/2);

    const circleX = player.center.x + cos * RADIUS_AROUND_PLAYER;
    const circleY = player.center.y + sin * RADIUS_AROUND_PLAYER;
    const color = building.type === "depot" ? "green" : "red";
    drawTriangle(ctx, circleX * GRID_SCALE, circleY * GRID_SCALE, TRIANGLE_SIZE * GRID_SCALE, angle, color);
}
function drawTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, color: CanvasColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(-size * 0.9, size);
    ctx.lineTo(size * 0.9, size);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

// function drawCollisions(ctx: CanvasRenderingContext2D, collisions: ICollision[]) {
//     for (let i = 0; i < numRegionCollisions; i++) {
//         const collision = collisions[i];
//         ctx.strokeStyle = "#f00";
//         ctx.lineWidth = 5;
//         ctx.beginPath();
//         ctx.moveTo(collision.edge.v0.x, collision.edge.v0.y);
//         ctx.lineTo(collision.edge.v1.x, collision.edge.v1.y);
//         ctx.stroke();
//     }
// }

// INPUT METHODS AND CALLBACKS

function keyCallback() {
    playerInputState.pos.x = keyboard.normalizedPos.x;
    playerInputState.pos.y = keyboard.normalizedPos.y;
    playerInputState.mode = "kb";
}

function joystickMoveCallback() {
    playerInputState.pos.x = joystick.normalizedPos.x;
    playerInputState.pos.y = joystick.normalizedPos.y;
    playerInputState.mode = "js";
}

// TODO: Delete
function doubleTapCallback() {
    // console.log(state);
    console.log("double tap");
}

// resize canvas to take up the whole screen (i.e. it takes 100% height and 100% width) but make sure the resolution doesn't exceed 1m pixels. CSS will stretch the canvas if it's too small.
function resizeCanvas() {
    let width = window.innerWidth;
    let height = window.innerHeight;
    let scale = 1;

    if (width > height) {
        scale = MAX_DIMENSION / width;
        width = MAX_DIMENSION;
        height *= scale
    } else {
        scale = MAX_DIMENSION / height;
        height = MAX_DIMENSION;
        width *= scale;
    }

    canvas.width = width;
    canvas.height = height;
    camera.canvasSize.x = canvas.width ;
    camera.canvasSize.y = canvas.height;
    joystick.resize();
}

function closestRegionToPos(pos: IPoint, regions: IPolygon[]): IPolygon {
    let minDist = Number.MAX_VALUE;
    let closestRegion = null;
    for (const region of regions) {
        const dist = distanceBetweenPoints(pos, region.center);
        if (dist < minDist) {
            minDist = dist;
            closestRegion = region;
        }
    }
    return closestRegion;
}

function findRegionIndexesWithinDistances(pos: IPoint, regions: IPolygon[], numRegions: number, maxDistance: number, minDistance: number): number[] {
    const closeRegions: number[] = [];
    // for (const region of regions) {
    for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        const dist = distanceBetweenPoints(pos, region.center);
        if (dist < maxDistance && dist > minDistance && i !== depotIndex) {
            closeRegions.push(i);
        }
    }

    console.log(closeRegions.length);
    return closeRegions.slice(0, numRegions);
}

function showMenu() {
    menu.classList.remove("hide");
    menu.classList.add("show");
    menu.style.removeProperty("opacity");
    UI_STATE.deliveryMenuVisible = true;

    // remove existing menu items from DOM and add upgrades
    const list = document.querySelector('.menu-list');
    list.innerHTML = '';

    for (const upgrade in upgrades) {
        const li = document.createElement('li');
        li.classList.add('menu-item');
        li.setAttribute('data-selected', 'false');
        // set cash amount in data attribute
        li.setAttribute('data-cash', upgrades[upgrade].toString());
        // set upgrade name in data attribute
        li.setAttribute('data-upgrade', upgrade);
        li.innerHTML = `${upgrade} - $${upgrades[upgrade]}`;
        list.appendChild(li);
    }


    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', handleMenuItemClick);
    });

}

function hideMenu() {
    menu.classList.remove("show");
    menu.classList.add("hide");
    UI_STATE.deliveryMenuVisible = false;

    const menuItems = document.querySelectorAll('.menu-item');
    // add selected upgrades to player and subtract cash
    menuItems.forEach(item => {
        const isSelected = item.getAttribute('data-selected') === 'true';
        if (isSelected) {
            const upgrade = item.getAttribute('data-upgrade');
            const cash = parseInt(item.getAttribute('data-cash'));
            player.upgrades.push(upgrade);
            updateCash(-cash);
        }

        item.removeEventListener('click', handleMenuItemClick);
    });
}

function handleMenuItemClick(e: Event) {
    const element = e.target as HTMLElement;
    const isSelected = element.getAttribute('data-selected') === 'true';
    element.setAttribute('data-selected', (!isSelected).toString());
    element.style.backgroundColor = isSelected ? '' : '#F0E68C';
    element.style.color = isSelected ? '' : '#000';
}


resizeCanvas()
grid.draw(gridCtx, GRID_SCALE);
// grid.drawRegions(regionsCtx, GRID_SCALE);
grid.drawRegions(buildingsCtx, GRID_SCALE);
grid.drawBuildings(buildingsCtx, GRID_SCALE);
if (deliveryIndices.length) grid.drawBuilding(buildingsCtx, buildings[deliveryIndices[0]], GRID_SCALE, "red");
requestAnimationFrame(tick);
window.addEventListener('resize', resizeCanvas);
document.querySelector(".menu-btn").addEventListener("click", () => {
    hideMenu();
    deliveryIndices.push(...findRegionIndexesWithinDistances(buildings[depotIndex].dropOffPoint, regions, NUM_INTIAL_DELIVERIES, 1000, 150));
});
