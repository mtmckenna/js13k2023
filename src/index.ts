import {Joystick} from "./joystick";
import {KeyboardInput} from "./keyboard_input";
import {
    calculateAngle, distance,
    getCos, getSin,
    normalizeVector,
    randomFloat,
    vectorFromEdge
} from "./math";
import {circlesCollide, findCollisions} from "./collision";
import {
    IPoint,
    IVehicleInputState,
    IEdge, ICollision, IBuilding, CanvasColor, IPolygon, IRegion, IGold,
} from "./interfaces";
import {
    roadsAndRegionsFromPoints,
} from "./level_generation";
import Grid, {GAME_WIDTH} from "./grid";
import Enemy from "./enemy";

import {FpsDisplay, DEBUG} from "./debug";
import Road, {ROAD_WIDTH} from "./road";
import Camera from "./camera";
import {BulletPool, GoldPool, PointPool} from "./pools";
import Boat from "./boat";
import {updatePos} from "./game_objects";
import {GLOBAL} from "./constants";
import {playCannonballHitEnemySound, playHitPlayerSound} from "./sound";

const canvas: HTMLCanvasElement = document.createElement("canvas");
const ctx: CanvasRenderingContext2D = canvas.getContext("2d");
const grid = new Grid();
const upgradeMenu: HTMLElement = document.querySelector("#upgrade-menu");
const restartMenu: HTMLElement = document.querySelector("#restart-menu");
const clock = document.querySelector("#clock");

canvas.id = "game";
canvas.width = 1000
canvas.height = 1000;
const GRID_SCALE = 1 / 2;

const camera = new Camera({x: 0, y: 0}, 1.25, 1, {x: canvas.width, y: canvas.height}, grid.gameSize, GRID_SCALE);

const NUM_POINTS = 100;
const NUM_ENEMIES = 200;
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
let goldCount = 0;
const neighborEnemies: Enemy[] = new Array(100).fill(null);
const MAX_TIME = 60 * 5;
GLOBAL.time = 0;

for (let i = 0; i < MAX_COLLISIONS; i++) {
    roadCollisions[i] = {v0: {x: 0, y: 0}, v1: {x: 0, y: 0}};
}

for (let i = 0; i < MAX_COLLISIONS; i++) {
    regionCollisions[i] = {edge: {v0: {x: 0, y: 0}, v1: {x: 0, y: 0}}, depth: 0};
}

const div = document.createElement("div");
div.appendChild(canvas);
document.body.prepend(canvas);

const roadCanvas = document.createElement('canvas');
const roadsCtx = roadCanvas.getContext('2d');
const regionsCanvas = document.createElement('canvas');
const regionsCtx = regionsCanvas.getContext('2d');
const offscreenCanvas: HTMLCanvasElement = document.createElement("canvas");
const offscreenBufferCtx: CanvasRenderingContext2D = offscreenCanvas.getContext("2d");
roadCanvas.width = grid.gameSize.x * GRID_SCALE;
roadCanvas.height = grid.gameSize.y * GRID_SCALE;
regionsCanvas.width = grid.gameSize.x * GRID_SCALE;
regionsCanvas.height = grid.gameSize.y * GRID_SCALE;
offscreenCanvas.width = grid.gameSize.x;
offscreenCanvas.height = grid.gameSize.y;

BulletPool.gameSize = grid.gameSize;
BulletPool.grid = grid;
BulletPool.initialize(1000);

let fpsDisplay = null;
if (DEBUG) fpsDisplay = new FpsDisplay();

const joystick = new Joystick(canvas, joystickMoveCallback);
const keyboard = new KeyboardInput(window, keyCallback);
const playerInputState: IVehicleInputState = {pos: {x: 0, y: 0}, mode: "kb"};
let points: IPoint[] = [];
let enemies: Enemy[] = [];
let lastDeliveryRegion: IRegion = null;
let selectedUpgrade: string = null;
let desiredDeliveryDistance = 0;
const MAX_DELIVERY_DISTANCE = GAME_WIDTH / 2;
const UI_STATE = {
    deliveryMenuVisible: false,
    restartMenuVisible: false,
    transferringCoins: false,
}

for (let i = 0; i < NUM_POINTS; i++) {
    let tries = 0;
    while (tries < MAX_POINT_TRIES) {
        const p = randomPointWithinBounds(grid.gameSize);
        let tooClose = false;
        for (const point of points) {
            if (distance(p, point) < MIN_POINT_DIST) {
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

function randomPointWithinBounds(bounds: IPoint): IPoint {
    return {
        x: randomFloat(0, bounds.x),
        y: randomFloat(0, bounds.y)
    };
}

let {roads, regions} = roadsAndRegionsFromPoints(points, grid.gameSize);
// const randomRoad = roads[Math.floor(Math.random() * roads.length)];
const randomRoad = findRoadCenterClosestToCenterOfGame();
const randomRoadPoint = randomRoad.center;

const upgrades: {name: string, cost: number}[] = [
    { name: "Super Sails", cost: 100 },
    { name: "Armor", cost: 100 },
    { name: "Forward Cannon", cost: 100 },
];

const depotIndex = regions.indexOf(closestRegionToPos(randomRoadPoint, regions));
const deliveryIndices: number [] = [];
const DROP_OFF_RADIUS = ROAD_WIDTH / 2;
let circleSize = DROP_OFF_RADIUS * .9 * GRID_SCALE; // Starting size
let sizeDirection = 1; // 1 for increasing, -1 for decreasing
const SIZE_SPEED = 0.25 * GRID_SCALE; // Adjust this to make the pulse faster or slower
const SIZE_MAX = DROP_OFF_RADIUS * .9 * GRID_SCALE; // Maximum size value
const SIZE_MIN = DROP_OFF_RADIUS * .6 * GRID_SCALE; // Minimum size value

const regionVertices = regions.map(r => r.vertices);

const player = new Boat(grid, playerInputState);
grid.setRoads(roads);

const depot: IRegion = regions[depotIndex];
depot.type = "depot";
updatePos(depot.dropOffPoint.x, depot.dropOffPoint.y, player);
player.angle = randomRoad.angle + Math.PI / 2;

// // Create gold at and near the center of the depot region
// for (let i = 0; i < 100; i++) {
//     const offsetX = randomFloat(-ROAD_WIDTH/4, ROAD_WIDTH/4);
//     const offsetY = randomFloat(-ROAD_WIDTH/4, ROAD_WIDTH/4);
//     const gold = GoldPool.get(depot.center.x + offsetX, depot.center.y + offsetY, depot, -1, offsetX,offsetY);
//     gold.drawable = true;
//     gold.updateable = false;
//     gold.arrived = true;
// }
//

// Generate enemies
for (let i = 0; i < NUM_ENEMIES; i++) {
    const enemy = new Enemy({x: randomFloat(0, grid.gameSize.x), y: randomFloat(0, grid.gameSize.y)}, grid, player)
    enemies.push(enemy);
    grid.addToEnemyMap(enemy);
}

// Generate gold for each region based on how far away it is from the depot (further away is more gold)
for (const region of regions) {
    if (region.type === "depot") continue;
    const amount = Math.floor(distance(region.center, depot.dropOffPoint) / 50)
    for (let i = 0; i < amount; i++) {
        const gold = GoldPool.get(region.center.x, region.center.y, depot, i * .1)
        gold.arrivalCallback = goldArrivedAtBoat;
        gold.arrived = false;
        region.gold.push(gold);
    }
}

function generateDeliveryRegionIndexDistanceOrMoreAwayFromDepot(desiredDistance: number): number {
    let minIndex = regions.indexOf(regions[0]);
    for (let i = 0; i < regions.length; i++) {
        // continue if the region is too close to the depot dropoff point
        if (distance(regions[i].center, depot.dropOffPoint) < ROAD_WIDTH * 2) continue;
        if (distance(regions[i].center, depot.dropOffPoint) < desiredDistance) continue;
        // set minIndex to the current index if it's closer to the depot dropoff point than the current minIndex
        if (distance(regions[i].center, depot.dropOffPoint) < distance(regions[minIndex].center, depot.dropOffPoint)) {
            minIndex = i;
        }
    }

    regions[minIndex].type = "delivery";
    deliveryIndices.push(minIndex);
    return minIndex;
}

function findRoadCenterClosestToCenterOfGame(): Road {
    let minDist = Number.MAX_VALUE;
    let closestRoad = null;
    for (const road of roads) {
        const dist = distance(road.center, {x: GAME_WIDTH / 2, y: GAME_WIDTH / 2});
        if (dist < minDist) {
            minDist = dist;
            closestRoad = road;
        }
    }
    return closestRoad;
}

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
    GoldPool.update(t);

    if (UI_STATE.transferringCoins) return;
    if (UI_STATE.deliveryMenuVisible) return;
    GLOBAL.time +=t;
    GLOBAL.timeLeft = Math.max(MAX_TIME - GLOBAL.time, 0);

    if (GLOBAL.timeLeft <= 0) {
        showRestartMenu();
        return;
    }

    grid.clearEnemyMap();

    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy || !enemy.active) continue;
        grid.addToEnemyMap(enemy);
    }

    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy || !enemy.active) continue;
        enemy.update(t);
    }

    if (player.active) player.update(t);
    BulletPool.update(t);

    // Bullet collide with enemies
    for (let i = 0; i < BulletPool.available.length; i++) {
        const bullet = BulletPool.available[i];
        if (!bullet.active) continue;
        grid.getNeighborEnemies(bullet.pos, neighborEnemies);
        for (let j = 0; j < neighborEnemies.length; j++) {
            if (!neighborEnemies[j] || !neighborEnemies[j].active) continue;
            const enemy = neighborEnemies[j];
            if (circlesCollide(bullet.center.x, bullet.center.y, bullet.radius, enemy.center.x, enemy.center.y, enemy.radius)) {
                BulletPool.release(bullet);
                playCannonballHitEnemySound();
                enemy.deactivate();
                break;
            }
        }
    }
    //
    // // Update gold
    // GoldPool.update(t);

    // Enemy collide with player
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy || !enemy.active) continue;
        // continue if enemy last hit player within wait time
        if (enemy.lastHitPlayerTime && (GLOBAL.time - enemy.lastHitPlayerTime) < enemy.hitWaitTime) continue;
        if (circlesCollide(player.center.x, player.center.y, player.radius, enemy.center.x, enemy.center.y, enemy.radius)) {
            player.life -= 1;
            enemy.lastHitPlayerTime = GLOBAL.time;
            playHitPlayerSound();
            if (player.life <= 0) {
                player.life = 0;
                player.active = false;
                if (!UI_STATE.restartMenuVisible) showRestartMenu();
            }

            camera.screenShake.active = true;
            camera.screenShake.elapsed = 0;
            camera.screenShake.magnitude = 3;   // Adjust based on desired intensity
        }
    }

    numRegionCollisions = findCollisions(player.vertices, regionVertices, regionCollisions);

    // wall collisions
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

    handleCollectingGold();

    camera.centerOn(player, FIXED_TIMESTEP);

    // Update screen shake
    if (camera.screenShake.active) {
        camera.screenShake.elapsed += t;

        if (camera.screenShake.elapsed >= camera.screenShake.duration) {
            camera.screenShake.active = false;
            camera.resetOffset(); // Reset any camera offset caused by the shake.
        } else {
            const x = (Math.random() - 0.5) * 2 * camera.screenShake.magnitude;
            const y = (Math.random() - 0.5) * 2 * camera.screenShake.magnitude;
            camera.setOffset(x, y);
        }
    }
}

function handleCollectingGold() {
    if (deliveryIndices.length > 0) {
        const {x: x1, y: y1} = player.center;
        const {radius: r1} = player;
        const region = regions[deliveryIndices[0]];
        const {x: x2, y: y2} = region.dropOffPoint;
        const inDropOffRadius = circlesCollide(x1, y1, r1, x2, y2, DROP_OFF_RADIUS);

        if (inDropOffRadius && player.speed < 1) {
            region.type = "empty";
            lastDeliveryRegion =  regions[deliveryIndices.shift()];
            goldCount += region.gold.length;
            player.gold.length = 0;
            for (let i = 0; i < region.gold.length; i++) {
                // const gold = GoldPool.get(region.center.x, region.center.y, player, i *.1);
                const gold = region.gold[i];
                gold.updateable = true;
                gold.drawable = true;
                gold.target = player;

                player.gold.push(gold);
            }

            UI_STATE.transferringCoins = true;
            region.gold.length = 0;
        }
    } else {
        const {x: x1, y: y1} = player.center;
        const {radius: r1} = player;
        const {x: x2, y: y2} = regions[depotIndex].dropOffPoint;
        const inDropOffRadius = circlesCollide(x1, y1, r1, x2, y2, DROP_OFF_RADIUS);

        if (inDropOffRadius && player.speed < 1) {

            for (let i = 0; i < player.gold.length; i++) {
                const gold = player.gold[i];
                const offsetX = randomFloat(-ROAD_WIDTH/4, ROAD_WIDTH/4);
                const offsetY = randomFloat(-ROAD_WIDTH/4, ROAD_WIDTH/4);
                gold.target = depot;
                gold.offset.x = offsetX;
                gold.offset.y = offsetY;
                gold.arrived = false;
                gold.updateDelay = i * .1;
                gold.time = 0;
                gold.arrivalCallback = goldArrivedAtDepot;
                depot.gold.push(gold);
            }

            player.gold.length = 0;
            UI_STATE.transferringCoins = true;
        }
    }
}

function draw(t: number) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    offscreenBufferCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    offscreenBufferCtx.imageSmoothingEnabled = false;

    if (lastDeliveryRegion) grid.drawRegion(regionsCtx, lastDeliveryRegion, GRID_SCALE);

    const sourceX = camera.pos.x * GRID_SCALE;
    const sourceY = camera.pos.y * GRID_SCALE;
    const sourceWidth = camera.canvasSize.x * GRID_SCALE / camera.currentZoom
    const sourceHeight = camera.canvasSize.y * GRID_SCALE / camera.currentZoom;

    const destX = 0;
    const destY = 0;
    const destWidth = camera.canvasSize.x;
    const destHeight = camera.canvasSize.y;

    // Logic to pulse circle size
    circleSize += SIZE_SPEED * sizeDirection;
    if (circleSize > SIZE_MAX || circleSize < SIZE_MIN) sizeDirection *= -1; // Reverse direction

    offscreenBufferCtx.fillStyle = "#F0E68C";
    let region = regions[depotIndex];
    if (deliveryIndices.length > 0) {
        offscreenBufferCtx.fillStyle = "red";
        region = regions[deliveryIndices[0]];
        grid.drawX(offscreenBufferCtx, region, GRID_SCALE);
    }

    offscreenBufferCtx.globalAlpha = .5; // Apply alpha transparency
    offscreenBufferCtx.beginPath();
    offscreenBufferCtx.arc(region.dropOffPoint.x * GRID_SCALE, region.dropOffPoint.y * GRID_SCALE, circleSize, 0, 2 * Math.PI);
    offscreenBufferCtx.fill();
    offscreenBufferCtx.globalAlpha = 1; // Reset alpha

    if (player.active) player.draw(offscreenBufferCtx, GRID_SCALE);

    BulletPool.draw(offscreenBufferCtx, GRID_SCALE);
    GoldPool.draw(offscreenBufferCtx, GRID_SCALE);
    grid.drawChest(offscreenBufferCtx, depot, GRID_SCALE);

    for (const enemy of enemies) enemy.draw(offscreenBufferCtx, GRID_SCALE, t);

    if (deliveryIndices.length > 0) {
        drawArrowToBuilding(offscreenBufferCtx, player.center, regions[deliveryIndices[0]]);
    } else {
        drawArrowToBuilding(offscreenBufferCtx, player.center, regions[depotIndex]);
    }

    ctx.drawImage(roadCanvas, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
    ctx.drawImage(regionsCanvas, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
    ctx.drawImage(offscreenCanvas, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);

    joystick.draw(ctx);

    drawLifeBar(ctx, canvas, player.life, 100);
    const minutes = Math.floor(GLOBAL.timeLeft / 60);
    const seconds = Math.floor(GLOBAL.timeLeft % 60);
    const displayMinutes = minutes < 10 ? "0" + minutes : minutes;
    const displaySeconds = seconds < 10 ? "0" + seconds : seconds;
    clock.textContent = `${displayMinutes}:${displaySeconds}`;
}

function drawArrowToBuilding(ctx: CanvasRenderingContext2D, center: IPoint, building: IBuilding) {
    const angle = calculateAngle(center.x, center.y, building.dropOffPoint.x, building.dropOffPoint.y) + Math.PI / 2;

    const TRIANGLE_SIZE = 10;
    const RADIUS_AROUND_PLAYER = player.radius + TRIANGLE_SIZE * 2.5;

    const cos = getCos(angle - Math.PI / 2);
    const sin = getSin(angle - Math.PI / 2);

    const circleX = player.center.x + cos * RADIUS_AROUND_PLAYER;
    const circleY = player.center.y + sin * RADIUS_AROUND_PLAYER;
    const color = building.type === "depot" ? "#F0E68C" : "red";
    drawTriangle(ctx, circleX * GRID_SCALE, circleY * GRID_SCALE, TRIANGLE_SIZE * GRID_SCALE, angle, color);
}

// draw life bar at top of screen the empty part of the life bar is white and the full part is red
// it stretches across the top of the screen and is 25 px tall
function drawLifeBar(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, life: number, maxLife: number) {
    ctx.save();
    ctx.translate(0, 5);
    ctx.beginPath();
    ctx.rect(10, 5, canvas.width - 20, 20);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.closePath();
    ctx.beginPath();
    ctx.rect(15, 10, (canvas.width - 30) * life / maxLife, 10);
    ctx.fillStyle = "#f00";
    ctx.fill();
    ctx.closePath();
    ctx.restore();
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
    camera.canvasSize.x = canvas.width;
    camera.canvasSize.y = canvas.height;
    joystick.resize();
}

function closestRegionToPos(pos: IPoint, regions: IRegion[]): IRegion {
    let minDist = Number.MAX_VALUE;
    let closestRegion = null;
    for (const region of regions) {
        const dist = distance(pos, region.center);
        if (dist < minDist) {
            minDist = dist;
            closestRegion = region;
        }
    }
    return closestRegion;
}

function goldArrivedAtBoat(gold: IGold) {
    if (player.gold.every(g => g.arrived)) {
        UI_STATE.transferringCoins = false;
    }
}

function goldArrivedAtDepot(gold: IGold) {
    if (depot.gold.every(g => g.arrived)) {
        UI_STATE.transferringCoins = false;
        showUpgradeMenu();
    }
}

function showRestartMenu() {
    restartMenu.classList.remove("hide");
    restartMenu.classList.add("show");
    restartMenu.style.pointerEvents = "auto";
    restartMenu.style.removeProperty("opacity");
    UI_STATE.restartMenuVisible = true;
}

function showUpgradeMenu() {
    upgradeMenu.classList.remove("hide");
    upgradeMenu.classList.add("show");
    upgradeMenu.style.pointerEvents = "auto";
    upgradeMenu.style.removeProperty("opacity");
    UI_STATE.deliveryMenuVisible = true;

    const currentMenuItems = document.querySelectorAll('.menu-item');
    currentMenuItems.forEach(item => {
        item.removeEventListener('click', handleMenuItemClick);
    });

    // remove existing menu items from DOM and add upgrades
    const list = document.querySelector('.menu-list');
    list.innerHTML = '';

    for (const upgrade of upgrades) {
        const li = document.createElement('li');
        li.classList.add('menu-item');
        li.setAttribute('data-selected', 'false');
        // set cash amount in data attribute
        li.setAttribute('data-cash', upgrade.cost.toString());
        // set upgrade name in data attribute
        li.setAttribute('data-upgrade', upgrade.name);
        li.innerHTML = `${upgrade.name} - $${upgrade.cost}`;
        list.appendChild(li);
    }


    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', handleMenuItemClick);
    });

}

function hideUpgradeMenu() {
    upgradeMenu.classList.remove("show");
    upgradeMenu.style.pointerEvents = "none";
    upgradeMenu.classList.add("hide");
    UI_STATE.deliveryMenuVisible = false;

    const menuItems = document.querySelectorAll('.menu-item');
    // add selected upgrades to player and subtract cash
    menuItems.forEach(item => {
        const isSelected = item.getAttribute('data-selected') === 'true';
        if (isSelected) {
            const upgrade = item.getAttribute('data-upgrade');
            const cash = parseInt(item.getAttribute('data-cash'));
            player.upgrades.push(upgrade);
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
    const upgrade = element.getAttribute('data-upgrade');
    selectedUpgrade = upgrade;
}

function addUpgrade(upgrade: string) {
    if (upgrade === "Forward Cannon") {
        player.forwardGun = true;
    }
}

resizeCanvas()
grid.drawRoads(roadsCtx, GRID_SCALE);
grid.drawRegions(regionsCtx, regions, GRID_SCALE);
generateDeliveryRegionIndexDistanceOrMoreAwayFromDepot(ROAD_WIDTH*3);
requestAnimationFrame(tick);
window.addEventListener('resize', resizeCanvas);
document.querySelector("#add-upgrade-btn").addEventListener("click", () => {
    hideUpgradeMenu();

    // increase the desired delivery distance by 1/4 the difference between current distance and the max distance
    desiredDeliveryDistance += (MAX_DELIVERY_DISTANCE - desiredDeliveryDistance) / 4;

    generateDeliveryRegionIndexDistanceOrMoreAwayFromDepot(desiredDeliveryDistance);



    addUpgrade(selectedUpgrade);
    selectedUpgrade = null;
});

document.querySelector("#try-again-btn").addEventListener("click", () => {
    window.location.reload();
});