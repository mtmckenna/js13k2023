import {ICircle, IPoint, IVehicleInputState} from "./interfaces";
import Grid from "./grid";
import {clamp} from "./math";
import Block from "./block";

const TURNING_SPEED_THRESHOLD = 0.1;
const VEL_BOOST_ROAD = .25;
const MAX_CELLS = 100;
export default class Vehicle extends Block implements ICircle {
    inputState: IVehicleInputState;
    grid: Grid;
    turnSpeed: number = .05;
    maxSpeed: number = 3;
    movingBackwards: boolean = false;
    acc: IPoint = {x: 0, y: 0};
    radius: number = 10
    constructor(grid: Grid, inputState: IVehicleInputState) {
        super();
        this.inputState = inputState;
        this.color = "#b465c7"
        this.updatePos(grid.gameSize.x / 2, grid.gameSize.y / 2);
        this.size = {x: 50, y: 25};
        const widthHalf = this.size.x / 2;
        const heightHalf = this.size.y / 2;
        const radius = Math.sqrt(widthHalf * widthHalf + heightHalf * heightHalf);
        this.radius = radius;
        this.grid = grid;
        this.occupiedCells = new Array(MAX_CELLS).fill(null);
    }

    get speed(): number {
        return Math.hypot(this.vel.x, this.vel.y);
    }
    turnKeyboard() {
        if (Math.abs(this.speed) < TURNING_SPEED_THRESHOLD) return;
        let sign = Math.sign(this.inputState.pos.x);
        if (this.movingBackwards) {
            sign = -sign
        }

        this.angle += this.turnSpeed * Math.abs(this.speed/this.maxSpeed) * sign % (Math.PI * 2);
    }

    turnJoyStick() {
        let magnitude = Math.hypot(this.inputState.pos.x, this.inputState.pos.y);

        if (magnitude > 0) {
            this.angle = Math.atan2(-this.inputState.pos.y, this.inputState.pos.x);
        }
    }

    updateVel() {
        const onRoad = true;
        const accMagnitude = (onRoad ? VEL_BOOST_ROAD : VEL_BOOST_ROAD*.5);
        const maxSpeed = onRoad ? this.maxSpeed : this.maxSpeed*.5;

        let direction = Math.hypot(this.inputState.pos.x, this.inputState.pos.y); // JS magnitude
        if (this.inputState.mode === "kb") direction = Math.sign(this.inputState.pos.y); // Keyboard magnitude

        this.acc.x = Math.cos(this.angle) * direction * accMagnitude;
        this.acc.y = Math.sin(this.angle) * direction * accMagnitude;


        this.vel.x += this.acc.x;
        this.vel.y += this.acc.y;

        // Limit the speed to the maximum speed
        const speed = Math.hypot(this.vel.x, this.vel.y);
        if (speed > maxSpeed) {
            const scaleFactor = maxSpeed / speed;
            this.vel.x *= scaleFactor;
            this.vel.y *= scaleFactor;
        }

        // Apply damping to gradually slow down the velocity
        const FRICTION = .95;
        this.vel.x *= FRICTION;
        this.vel.y *= FRICTION;

        this.movingBackwards = this.inputState.mode === "kb" && this.inputState.pos.y < 0;

    }


    update(): void {

        if (this.inputState.mode === "js") {
            this.turnJoyStick();
        } else {
            this.turnKeyboard();
        }

        this.updateVel();


        // update player pos but mind the edges of the canvas
        const x = clamp(this.pos.x + this.vel.x, 0, this.grid.gameSize.x - this.size.x);
        const y = clamp(this.pos.y + this.vel.y, 0, this.grid.gameSize.y - this.size.y);
        this.updatePos(x, y);
    }

    draw(ctx: CanvasRenderingContext2D, scale:number = 1): void {
        const headlightSize = 6 * scale;
        const rBlinkerSize = 4 * scale;
        const mirrorSize = 4 * scale;
        const windshieldWidth = 20 * scale;
        const windshieldHeight = 10 * scale;
        const rWindshieldWidth = 18 * scale;
        const rWindshieldHeight = 8 * scale;
        const sizeX = this.size.x * scale;
        const sizeY = this.size.y * scale;
        super.draw(ctx, scale);
        ctx.save();
        ctx.translate(this.center.x*scale, this.center.y * scale);
        ctx.rotate(this.angle);
        ctx.fillStyle = "yellow";
        ctx.fillRect(sizeX/2 - headlightSize, -sizeY/2, headlightSize, headlightSize);
        ctx.fillRect(sizeX/2 - headlightSize, sizeY/2 - headlightSize, headlightSize, headlightSize);
        ctx.fillStyle = "#5a5a5a";
        ctx.fillRect(4*scale, -windshieldWidth/2, windshieldHeight, windshieldWidth);
        ctx.fillRect(-16*scale, -rWindshieldWidth/2, rWindshieldHeight, rWindshieldWidth);
        ctx.fillStyle = "#613742";

        if (this.movingBackwards) ctx.fillStyle = "white";
        ctx.fillRect(-sizeX/2, -sizeY/2, rBlinkerSize, rBlinkerSize);
        ctx.fillRect(-sizeX/2, sizeY/2 - rBlinkerSize, rBlinkerSize, rBlinkerSize);

        ctx.fillStyle = this.color;
        ctx.fillRect(11*scale, -sizeY/2 - mirrorSize+1*scale, mirrorSize, mirrorSize);
        ctx.fillRect(11*scale, sizeY/2 -1*scale, mirrorSize, mirrorSize);
        ctx.restore();

        ctx.save();

        // Set the position, size, and orientation for the headlight beams
        ctx.translate(this.center.x*scale, this.center.y*scale);
        ctx.rotate(this.angle);

        // Create radial gradients for each headlight
        const lightLength = 50*scale; // Adjust this value to change the length of the light beam
        const lightSpread = 20*scale; // Adjust this value to change the spread of the light beam
        for (let offset of [-sizeY/2+headlightSize/2, sizeY/2-headlightSize/2]) {  // Two headlights spaced apart
            // Create a path for the light beam
            ctx.beginPath();
            ctx.moveTo(20*scale, offset); // Start at the headlight position
            ctx.lineTo(lightLength, offset - lightSpread); // Go to the upper boundary of the light
            ctx.lineTo(lightLength, offset + lightSpread); // Go to the lower boundary of the light
            ctx.closePath(); // Close the path

            ctx.clip(); // Clip the context to this path

            // Create a radial gradient within the clipped path
            let gradient = ctx.createRadialGradient(0, offset, 0, lightLength, offset, lightLength);
            gradient.addColorStop(0, "rgba(255,255,180,0.4)"); // Bright at the center
            gradient.addColorStop(1, "rgba(255,255,180,0)");   // Fades out towards the edge

            // Draw the light beam
            ctx.fillStyle = gradient;
            ctx.fillRect(0, offset - lightSpread, lightLength, lightSpread * 2);

            // Reset the context clipping
            ctx.restore();
            ctx.save();
            ctx.translate(this.center.x*scale, this.center.y*scale);
            ctx.rotate(this.angle);
        }

        ctx.restore();
    }
}

