var Input = {
  keys: [],
  mouse: { left: false, right: false, middle: false, x: 0, y: 0 }
};
for (var i = 0; i < 230; i++) Input.keys.push(false);

document.addEventListener("keydown", e => { Input.keys[e.keyCode] = true; });
document.addEventListener("keyup", e => { Input.keys[e.keyCode] = false; });
document.addEventListener("mousedown", e => {
  if (e.button === 0) Input.mouse.left = true;
  if (e.button === 1) Input.mouse.middle = true;
  if (e.button === 2) Input.mouse.right = true;
});
document.addEventListener("mouseup", e => {
  if (e.button === 0) Input.mouse.left = false;
  if (e.button === 1) Input.mouse.middle = false;
  if (e.button === 2) Input.mouse.right = false;
});
document.addEventListener("mousemove", e => {
  Input.mouse.x = e.clientX;
  Input.mouse.y = e.clientY;
});

var canvas = document.createElement("canvas");
document.body.appendChild(canvas);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
canvas.style.position = "absolute";
canvas.style.left = "0px";
canvas.style.top = "0px";

// Set black background
canvas.style.backgroundColor = "black";

var ctx = canvas.getContext("2d");

// Segment class
class Segment {
  constructor(parent, size, angle, range, stiffness) {
    this.parent = parent;
    if (typeof parent.children === "object") parent.children.push(this);
    this.children = [];
    this.size = size;
    this.relAngle = angle;
    this.defAngle = angle;
    this.absAngle = parent.absAngle + angle;
    this.range = range;
    this.stiffness = stiffness;
    this.updateRelative(false, true);
  }
  updateRelative(iter, flex) {
    this.relAngle -=
      2 * Math.PI * Math.floor((this.relAngle - this.defAngle) / (2 * Math.PI) + 0.5);
    if (flex) {
      this.relAngle = Math.min(
        this.defAngle + this.range / 2,
        Math.max(
          this.defAngle - this.range / 2,
          (this.relAngle - this.defAngle) / this.stiffness + this.defAngle
        )
      );
    }
    this.absAngle = this.parent.absAngle + this.relAngle;
    this.x = this.parent.x + Math.cos(this.absAngle) * this.size;
    this.y = this.parent.y + Math.sin(this.absAngle) * this.size;
    if (iter) this.children.forEach(c => c.updateRelative(iter, flex));
  }
  draw(iter) {
    // Draw smooth thick line between parent and this segment with rounded ends
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Body color gradient from dark green to light green
    let grad = ctx.createLinearGradient(this.parent.x, this.parent.y, this.x, this.y);
    grad.addColorStop(0, "#06470c");
    grad.addColorStop(1, "#2ecc40");

    ctx.strokeStyle = grad;
    ctx.lineWidth = this.size * 1.6;
    ctx.beginPath();
    ctx.moveTo(this.parent.x, this.parent.y);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    // Draw subtle scale pattern: small circles along the segment line
    ctx.fillStyle = "rgba(30, 150, 20, 0.2)";
    let steps = Math.floor(this.size / 3);
    for (let i = 0; i <= steps; i++) {
      let px = this.parent.x + (i / steps) * (this.x - this.parent.x);
      let py = this.parent.y + (i / steps) * (this.y - this.parent.y);
      ctx.beginPath();
      ctx.arc(px, py, this.size * 0.25 * Math.sin((i / steps) * Math.PI), 0, 2 * Math.PI);
      ctx.fill();
    }

    if (iter) this.children.forEach(c => c.draw(true));
  }
  follow(iter) {
    var x = this.parent.x,
      y = this.parent.y;
    var dist = Math.hypot(this.x - x, this.y - y);
    this.x = x + (this.size * (this.x - x)) / dist;
    this.y = y + (this.size * (this.y - y)) / dist;
    this.absAngle = Math.atan2(this.y - y, this.x - x);
    this.relAngle = this.absAngle - this.parent.absAngle;
    this.updateRelative(false, true);
    if (iter) this.children.forEach(c => c.follow(true));
  }
}

// LimbSystem class
class LimbSystem {
  constructor(end, length, speed, creature) {
    this.end = end;
    this.length = Math.max(1, length);
    this.creature = creature;
    this.speed = speed;
    creature.systems.push(this);
    this.nodes = [];
    var node = end;
    for (var i = 0; i < length; i++) {
      this.nodes.unshift(node);
      node = node.parent;
      if (!node.isSegment) {
        this.length = i + 1;
        break;
      }
    }
    this.hip = this.nodes[0].parent;
  }
  moveTo(x, y) {
    this.nodes[0].updateRelative(true, true);
    var dist = Math.hypot(x - this.end.x, y - this.end.y);
    var len = Math.max(0, dist - this.speed);
    for (var i = this.nodes.length - 1; i >= 0; i--) {
      var node = this.nodes[i];
      var ang = Math.atan2(node.y - y, node.x - x);
      node.x = x + len * Math.cos(ang);
      node.y = y + len * Math.sin(ang);
      x = node.x;
      y = node.y;
      len = node.size;
    }
    this.nodes.forEach(node => {
      node.absAngle = Math.atan2(node.y - node.parent.y, node.x - node.parent.x);
      node.relAngle = node.absAngle - node.parent.absAngle;
      node.children.forEach(child => {
        if (!this.nodes.includes(child)) child.updateRelative(true, false);
      });
    });
  }
  update() {
    this.moveTo(Input.mouse.x, Input.mouse.y);
  }
}

// Creature class with realistic snake head
class Creature {
  constructor(
    x,
    y,
    angle,
    fAccel,
    fFric,
    fRes,
    fThresh,
    rAccel,
    rFric,
    rRes,
    rThresh
  ) {
    this.x = x;
    this.y = y;
    this.absAngle = angle;
    this.fSpeed = 0;
    this.fAccel = fAccel; 
    this.fFric = fFric;
    this.fRes = fRes;
    this.fThresh = fThresh;
    this.rSpeed = 0;
    this.rAccel = rAccel;
    this.rFric = rFric;
    this.rRes = rRes;
    this.rThresh = rThresh;
    this.children = [];
    this.systems = [];
  }
  follow(x, y) {
    var dist = Math.hypot(this.x - x, this.y - y);
    var angle = Math.atan2(y - this.y, x - this.x);
    var accel = this.fAccel;
    if (this.systems.length > 0) {
      var sum = 0;
      for (var i = 0; i < this.systems.length; i++) {
        sum += this.systems[i].step == 0;
      }
      accel *= sum / this.systems.length;
    }
    this.fSpeed += accel * (dist > this.fThresh);
    this.fSpeed *= 1 - this.fRes;
    this.speed = Math.max(0, this.fSpeed - this.fFric);
    var dif = this.absAngle - angle;
    dif -= 2 * Math.PI * Math.floor(dif / (2 * Math.PI) + 0.5);
    if (Math.abs(dif) > this.rThresh && dist > this.fThresh) {
      this.rSpeed -= this.rAccel * (2 * (dif > 0) - 1);
    }
    this.rSpeed *= 1 - this.rRes;
    if (Math.abs(this.rSpeed) > this.rFric) {
      this.rSpeed -= this.rFric * (2 * (this.rSpeed > 0) - 1);
    } else {
      this.rSpeed = 0;
    }
    this.absAngle += this.rSpeed;
    this.absAngle -= 2 * Math.PI * Math.floor(this.absAngle / (2 * Math.PI) + 0.5);
    this.x += this.speed * Math.cos(this.absAngle);
    this.y += this.speed * Math.sin(this.absAngle);
    this.absAngle += Math.PI;

    this.children.forEach(c => c.follow(true, true));
    this.systems.forEach(s => s.update(x, y));

    this.absAngle -= Math.PI;
    this.draw(true);
  }
  draw(iter) {
    var r = 12;
    
    // Snake body head shading
    var headGrad = ctx.createRadialGradient(this.x, this.y, r * 0.3, this.x, this.y, r);
    headGrad.addColorStop(0, "#98fb98"); // pale green center
    headGrad.addColorStop(1, "#006400"); // dark green edges

    ctx.fillStyle = headGrad;
    ctx.strokeStyle = "#003300";
    ctx.lineWidth = 3;

    // Draw snake head as a pointed ellipse (like a snake head)
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.absAngle);

    // Head shape
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(r * 1.5, -r * 0.8, r * 1.5, r * 0.8, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eyes
    var eyeY = r * 0.4;
    var eyeX = r * 0.8;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.ellipse(eyeX, -eyeY, r * 0.3, r * 0.15, 0, 0, 2 * Math.PI);
    ctx.ellipse(eyeX, eyeY, r * 0.3, r * 0.15, 0, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(eyeX, -eyeY, r * 0.12, r * 0.1, 0, 0, 2 * Math.PI);
    ctx.ellipse(eyeX, eyeY, r * 0.12, r * 0.1, 0, 0, 2 * Math.PI);
    ctx.fill();

    // Tongue - forked
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 1.5, 0);
    ctx.lineTo(r * 2.4, -r * 0.5);
    ctx.moveTo(r * 1.5, 0);
    ctx.lineTo(r * 2.4, r * 0.5);
    ctx.stroke();

    ctx.restore();

    if (iter) this.children.forEach(c => c.draw(true));
  }
}

var critter;

function setupSnake() {
  critter = new Creature(
    window.innerWidth / 2,
    window.innerHeight / 2,
    0,
    4, // slower movement
    1,
    0.5,
    16,
    0.5,
    0.085,
    0.5,
    0.3
  );
  var node = critter;
  for (var i = 0; i < 50; i++) {
    node = new Segment(node, 12, 0, Math.PI / 2, 1);
  }
  setInterval(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    critter.follow(Input.mouse.x, Input.mouse.y);
  }, 33);
}

setupSnake();

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
