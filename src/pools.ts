import {IGold, IPoint, IPoolPoint} from "./interfaces";
import {Bullet} from "./bullet";
import {drawPixels, updatePos} from "./game_objects";
import Grid from "./grid";
import {PIXEL_SIZE} from "./constants";


export class PointPool {
    private static available: IPoolPoint[] = [];

    static initialize(count: number): void {
        for (let i = 0; i < count; i++) {
            PointPool.available.push({x: 0, y: 0, active: false});
        }
    }

    static get(x: number = 0, y: number = 0): IPoolPoint {
        for (let i = 0; i < PointPool.available.length; i++) {
            const point = PointPool.available[i];
            if (!point.active) {
                point.x = x;
                point.y = y;
                point.active = true;
                return point;
            }
        }

        const point = {x, y, active: true};
        PointPool.available.push(point);
        console.warn("PointPool ran out of points.");
        return point;
    }

    static release(point: IPoolPoint) {
        point.x = 0;
        point.y = 0;
        point.active = false;
    }
}

PointPool.initialize(1000);

export class BulletPool {
    public static available: Bullet[] = [];
    public static gameSize: IPoint = {x: 0, y: 0};
    public static grid: Grid;

    static initialize(count: number): void {
        for (let i = 0; i < count; i++) {
            BulletPool.available.push(new Bullet());
        }
    }

    static get(x: number, y: number): Bullet | null {
        if (!BulletPool.grid) return null;
        for (let i = 0; i < BulletPool.available.length; i++) {
            const bullet = BulletPool.available[i];
            if (!bullet.active) {
                bullet.active = true;
                updatePos(x, y, bullet);
                return bullet;
            }
        }

        const bullet = new Bullet();
        updatePos(x, y, bullet);
        BulletPool.available.push(bullet);
        console.warn("out of bullets.");
        return bullet;
    }

    static update(t: number) {
        // update bullets and deactivate them if they are out of bounds and reset their lifeTime and set them to inactive
        for (let i = 0; i < BulletPool.available.length; i++) {
            const bullet = BulletPool.available[i];
            if (bullet.active) {
                bullet.update(t);
            }

            if (bullet.pos.x < 0 || bullet.pos.x > BulletPool.gameSize.x|| bullet.pos.y < 0 || bullet.pos.y > BulletPool.gameSize.y || bullet.lifeTime > bullet.maxLifeTime) {
                BulletPool.release(bullet);
            }

        }
    }

    static draw(ctx: CanvasRenderingContext2D, scale: number = 1) {
        for (let i = 0; i < BulletPool.available.length; i++) {
            const bullet = BulletPool.available[i];
            if (bullet.active) {
                ctx.save();
                ctx.translate(bullet.center.x * scale, bullet.center.y * scale);
                ctx.rotate(bullet.angle);
                ctx.imageSmoothingEnabled = false;  // Ensure no smoothing for main canvas

                // draw bullet which is a square that rotates based on the bullets angle
                ctx.fillStyle = "#000";
                ctx.fillRect(-bullet.size.x*scale, -bullet.size.y*scale, bullet.size.x*scale, bullet.size.y*scale);

                ctx.restore();
            }
        }
    }

    static release(bullet: Bullet) {
        bullet.active = false;
        bullet.lifeTime = 0;
    }
}


const GOLD_PIXELS = [
    [0, 1, 1, 0],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [0, 1, 1, 0],
];

const GOLD_PIXELS_COLOR_MAP = [null, "#FFD700"];

const goldCanvas = document.createElement("canvas");
const goldCtx = goldCanvas.getContext("2d");
goldCanvas.width = GOLD_PIXELS[0].length * PIXEL_SIZE;
goldCanvas.height = GOLD_PIXELS.length * PIXEL_SIZE;
drawPixels(goldCtx, GOLD_PIXELS, GOLD_PIXELS_COLOR_MAP, PIXEL_SIZE);
export class GoldPool {
    public static available: IGold[] = [];

    static initialize(count: number): void {
        for (let i = 0; i < count; i++) {
            GoldPool.available.push(createGold());
        }
    }

    static get(x: number, y: number): IGold | null {
        for (let i = 0; i < GoldPool.available.length; i++) {
            const gold = GoldPool.available[i];
            if (!gold.active) {
                gold.active = true;
                updatePos(x, y, gold);
                return gold;
            }
        }

        const gold = createGold();
        updatePos(x, y, gold);
        GoldPool.available.push(gold);
        console.warn("out of gold.");
        return gold;
    }

    static update(t: number) {
        // update gold and deactivate them if they are out of bounds and reset their lifeTime and set them to inactive
        for (let i = 0; i < GoldPool.available.length; i++) {
            const gold = GoldPool.available[i];
            if (gold.active) gold.update(t);

            if (gold.pos.x < 0 || gold.pos.x > BulletPool.gameSize.x|| gold.pos.y < 0 || gold.pos.y > BulletPool.gameSize.y) {
                GoldPool.release(gold);
            }

        }
    }

    static draw(ctx: CanvasRenderingContext2D, scale: number = 1) {
        for (let i = 0; i < GoldPool.available.length; i++) {
            const gold = GoldPool.available[i];
            if (!gold.active) continue;
            const height = GOLD_PIXELS.length * PIXEL_SIZE;
            const width = GOLD_PIXELS[0].length * PIXEL_SIZE;
            ctx.save();
            ctx.translate(gold.center.x * scale, gold.center.y * scale);
            ctx.rotate(gold.angle);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(goldCanvas, 0, 0, width, height, -width / 2 * scale, -height / 2 * scale, width * scale, height * scale);
            ctx.restore();
        }
    }

    static release(gold: IGold) {
        gold.active = false;
    }
}

function updateGold(t: number) {
    this.lifeTime += t;
    if (this.lifeTime > this.maxLifeTime) this.active = false;

    const posX = this.pos.x + this.vel.x;
    const posY = this.pos.y + this.vel.y;
    this.angle += .01 % 2* Math.PI;

    updatePos(posX, posY, this);
}

function createGold(): IGold {
    const gold = {active: false, pos: {x:0,y:0}, center: {x:0,y:0}, size: {x:0,y:0}, radius: 0, vel: {x:0,y:0}, angle: 0, update: () => updateGold, numOccupiedCells: 0, occupiedCells: [], vertices: [{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}], index:0};
    return gold;
}

GoldPool.initialize(5000);
