var
  win       = window,
  doc       = document,
  WIDTH     = 320,
  HEIGHT    = 240,
  id        = 0,
  frames    = 0,
  aFrames   = 0,
  screen    = 0, // 0 =  title, 1 = game, etc
  alphabet  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:!-',
  updaters  = [],
  images    = [],
  applied   = {},
  commands  = {},
  entities  = [],

  APPLY_TYPES         = ['keydown', 'mousedown'],
  ANIMATION_TIME_UNIT = 80,
  TIME_UNIT           = 20,
  MAP_SIZE_X          = 20,
  MAP_SIZE_Y          = 20,
  TILESIZE_X          = 16, // everything is square right now
  UP                  = 87, // w
  DOWN                = 83, // s
  RIGHT               = 68, // d
  LEFT                = 65, // a
  SPACE               = 32,
  ZERO_LIMIT          = 0.2,
  SHOOT               = 1,
  STAGE_SCALE         = 3,

  mctx,
  bctx,
  main,
  frame,
  aFrame,
  buffer,
  player,
  updater,
  tileset,
  abcImage,
  map2DArray,

  getId = function getId() {
    return ++id;
  },

  createCanvas = function createCanvas(width, height, canvas) {
    canvas        = doc.createElement('canvas');
    canvas.width  = width  || WIDTH;
    canvas.height = height || HEIGHT;

    canvas.getCtx = function getCtx(ctx) {
      ctx = canvas.getContext('2d');
      ctx.mozImageSmoothingEnabled = ctx.imageSmoothingEnabled = false;
      return ctx;
    };

    return canvas;
  },

  setEntityState = function setEntityState(entity, state, counter, data) {
    if (state !== entity.state) {
      entity.frame = 0;
    }

    entity.state    = state;
    entity.counter  = counter;
    entity.data     = data;
  },

  createEntity = function createEntity(pos, img, cfg, spd, entity) {
    entity = {
      'img'   : img,
      'cfg'   : cfg,
      'pos'   : pos,
      'cmd'   : [],
      'spd'   : spd || [0, 0],
      'acc'   : [0, 0]
    };

    setEntityState(entity, 'idling');
    entities.push(entity);

    return entity;
  },

  /**
   * [drawPath description]
   * @param {Array} arr
   * @param {Number} ax
   * @param {Number} ay
   * @param {Number} bx
   * @param {Number} by
   */
  drawPath = function drawPath(arr, ax, ay, bx, by, xIncrement, yIncrement) {
    xIncrement = yIncrement = 1;
    if (ax > bx) {
      xIncrement = -1;
    }
    if (ay > by) {
      yIncrement = -1;
    }

    for (;ax !== bx && ax < arr.length - 1; ax+= xIncrement) {
      arr[ax][ay] = arr[ax][ay] || 3;
    }

    for (;ay !== by && ay < arr[ax].length - 1; ay+= yIncrement) {
      arr[ax][ay] = arr[ax][ay] || 3;
    }

  },
  /**
   * Creates rooms and connects them with paths
   * @param {Array.<Array>} arr [description]
   * @param {Number} xc centered x coordinate of this room
   * @param {Number} yc see xc
   * @param {Number} w width
   * @param {Number} h height
   * @param {Number} color base color (or base tile) of this room
   * @param {Number} iteration safety feature to prevent stack issues
   */
  createRoom = function createRoom(arr, xc, yc, w, h, color, iteration, sizeX, sizeY, i, j, xi, yj, x, y, m, n) {
    if (w * h > 3) { // single tile wide rooms are stupid
      i = 0;
      // find top left corner of new room
      x = Math.min(Math.max(xc - (w >> 1), 0), sizeX - 1);
      y = Math.min(Math.max(yc - (h >> 1), 0), sizeY - 1);

      while (i++ < w && (xi = x + i) < sizeX) {
        j = 0;
        while (j++ < h && y + j < sizeY) {
          arr[xi][y + j] = arr[xi][y + j] || color;
        }
      }

      // spawn more rooms
      if (iteration < 3) {
        i = 4;
        while (i--) {
          // TODO: fiddle aMath.round with those values
          createRoom(
            arr,
            m = (xc + w * (+(Math.random() > 0.5) || -1)), // (+(Math.random() > 0.5) || -1) -> 1 || -1
            n = (yc + h * (+(Math.random() > 0.5) || -1)),
            xi = (3 - iteration * (Math.random() * w) | 0),
            yj = (3 - iteration * (Math.random() * h) | 0),
            Math.random() * 3 | 0,
            iteration + 1,
            sizeX,
            sizeY
          );
          if (xi * yj > 3) {
            drawPath(arr, xc, yc, m, n);
          }
        }
      }
    }
  },
  /**
   * [mapGen description]
   * @param {Number} sizeX [description]
   * @param {Number} sizeY [description]
   */
  mapGen = function mapGen(sizeX, sizeY, x, arr) {
    arr = [];
    arr.length = sizeX;

    x = sizeX;
    while (x--) {
      arr[x] = [];
      arr[x].length = sizeY;
    }

    // create center room
    createRoom(arr, sizeX >> 1, sizeY >> 1, 4, 4, 1, 0, sizeX, sizeY);
    return arr;
  },

  drawEntity = function drawEntity(entity, stepFrame, cfg, frame, frameCfg, img, y) {
    img       = entity.img;
    cfg       = entity.cfg;
    frameCfg  = cfg[entity.state];
    frame     = entity.frame % frameCfg.frames;
    y         = frameCfg.y || 0;
    y        += entity.mirrored ? img.height / 2 : 0;

    bctx.drawImage(
      img,
      frame * cfg.size, //sx
      y, //sy
      cfg.size, //sw
      cfg.size, //sh
      entity.pos[0] - (cfg.size>>1), //dx
      entity.pos[1] - (cfg.size), //dy
      cfg.size,
      cfg.size
    );

    bctx.fillRect(entity.pos[0] - 1, entity.pos[1] - 1, 2, 2); // center point of entity, comment back in for debugging & stuff

    if (stepFrame) {
      entity.frame++;
    }
  },

  drawWall = function drawWall(x, y, height) {
    //
    // Meh, maybe this is not right here, but ATM it does what I need
    //
    if (map2DArray[x][y]) {
      return;
    }

    height = height || 32;

    bctx.drawImage(
      tileset, //img
      32, //sx
      9, //sy
      TILESIZE_X, //sw
      height, //sh
      x * TILESIZE_X, //dx
      y * TILESIZE_X - 7, //dy
      TILESIZE_X, //dw
      height //dh
    );
  },

  drawField = function drawField(x, y) {
    bctx.drawImage(
      tileset, //img
      ((x + y) % 2) * TILESIZE_X, //sx
      TILESIZE_X, //sy
      TILESIZE_X, //sw
      TILESIZE_X, //sh
      x * TILESIZE_X, //dx
      y * TILESIZE_X, //dy
      TILESIZE_X, //dw
      TILESIZE_X //dh
    );
  },

  getEntityTilesIndex = function getEntityTilesIndex(entity) {
    return [
      Math.round(entity.pos[0] / TILESIZE_X),
      Math.floor(entity.pos[1] / TILESIZE_X)
    ];
  },

  zCompare = function zCompare(a, b) {
    return b.pos[1] - a.pos[1];
  },

  drawMap = function drawMap(isAnimationFrame, x, y, len, entityTilesIndex) {
    entities.sort(zCompare);

    for (y = 0; y < map2DArray[0].length; y++) {
      for (x = 0; x < map2DArray.length; x++) {
        if (map2DArray[x][y]) {
          drawField(x, y);
        } else {
          drawWall(x, y);
        }
      }
    }

    len = entities.length;

    while (len--) {
      drawEntity(entities[len], isAnimationFrame);

      entityTilesIndex = getEntityTilesIndex(entities[len]);

      drawWall(entityTilesIndex[0],     entityTilesIndex[1] + 1, 10);
      drawWall(entityTilesIndex[0] - 1, entityTilesIndex[1] + 1, 10);
    }
  },

  /**
   * Just some color jittering (for now)
   * @param {Number} type e.g. JITTER
   */
  glitch = function glitch(canvas, ctx, obj, data, i) {
    ctx  = canvas.getCtx();
    obj  = ctx.getImageData(0, 0, canvas.width, canvas.height);
    data = obj.data;
    i    = data.length;

    while (i--) {
      switch (i%4) {
        case 1: {
          data[i] = data[i-4];
          break;
        }
        case 2: {
          data[i] = data[i-8];
          break;
        }
      }
    }

    ctx.putImageData(obj, 0, 0);
  },

  /**
   * Creates a basic star [x, y, z]
   * @return {Array.<Number>}
   */
  star = function star() {
    return [
      0.5 - Math.random(),
      0.5 - Math.random(),
      Math.random() * 3
    ];
  },

  /**
   * @type {Array.<Array.<Number>>}
   */
  field = (function (a, amount) {
    while (amount--) {
      a[amount] = star();
    }

    return a;
  })([], 100),

  /**
   * renders the title starfield effect
   * can be thrown away if we need the additional bytes.
   */
  starField = function starField(i, f, z) {
    bctx.fillStyle = '#fff';
    i = field.length;

    while (i--) {
      f = field[i];

      if ((z = f[2]) < 0.5) {
        field[i] = star(); // spawn new stars if they fade out
      }

      bctx.fillRect(
        WIDTH / 2  + f[0] * z * WIDTH,
        HEIGHT / 2 + f[1] * z * HEIGHT,
        z,
        f[2] -= (z * (i%3 + 1) * 0.01)
      );
    }
  },

  /**
   * Renders a given string
   * @param  {String} str must be uppercase
   * @param  {Number} x
   * @param  {Number} y
   * @param  {Number} wave make waving text
   * @param  {Number} frame current frame
   */
  text = function text(str, x, y, wave, frame, i) {
    // text = function (str, x, y, wave = 0, frame, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:!-', i = 0)
    // no ES6 support in uglify :/
    wave = wave || 0;

    for (i = 0; i < str.length; i++) {
      bctx.drawImage(
        abcImage, //img
        alphabet.indexOf(str[i]) * 8, //sx
        0, //sy
        8, //sw
        8, //sh
        x + i * 9, //dx
        y + (wave * Math.sin(frame / 2 + i) | 0) || 0, //dy
        8, //dh
        8 //dw
      );
    }
  },

  getAccDirection = function getAccDirection(entity, acc, res) {
    acc = entity.acc;
    res = [Math.sign(acc[0]), Math.sign(acc[1])];

    return !res[0] && !res[1] ? 0 : res;
  },

  setUpdater = function setUpdater(fn) {
    updater = fn;
  },

  updateEntitySpeedAxis = function updateEntitySpeedAxis(entity, axis, axisSpd) {
    axisSpd  = entity.spd[axis];
    axisSpd += entity.acc[axis];
    axisSpd *= entity.cfg.friction;
    axisSpd  = Math.abs(axisSpd) < ZERO_LIMIT ? 0 : axisSpd;

    entity.spd[axis] = axisSpd;
  },

  updateEntitySpeed = function updateEntitySpeed(entity) {
    updateEntitySpeedAxis(entity, 0);
    updateEntitySpeedAxis(entity, 1);
  },

  updateEntityPosition = function updateEntityPosition(entity, spd, pos, oldX, oldY, tileX, tileY) {
    pos  = entity.pos;
    spd  = entity.spd;

    if (!getAccDirection(entity)) {
      setEntityState(entity, 'idling');
      return;
    }

    oldX = pos[0];
    oldY = pos[1];

    pos[0] += spd[0];
    pos[1] += spd[1];

    tileX = Math.floor(pos[0] / TILESIZE_X);
    tileY = Math.floor(pos[1] / TILESIZE_X);

    setEntityState(entity, 'moving');

    // TODO: this is the naive implementation
    if (!map2DArray[tileX][tileY]) {
      pos[0] = oldX;
      pos[1] = oldY;
    }
  },

  teleport = function teleport(apply, event, finished, direction, pos) {
    direction = direction || getAccDirection(player);
    apply     = direction && apply;

    if (!apply) {
      return;
    }

    pos = player.pos;

    if (finished) {
      pos[0] += direction[0] * 40;
      pos[1] += direction[1] * 40;
    } else {
      setEntityState(player, 'tping', 12, direction);
    }
  },

  updateEntityCounter = function updateEntityCounter(entity) {
    if (entity.state === 'tping') {
      entity.counter--;

      if (!entity.counter) {
        teleport(1, 0, 1, entity.data);

        setEntityState(entity, 'idling');
      }
    }
  },

  updateEntity = function updateEntity(entity, command, entityCommands) {
    updateEntityCounter(entity);

    entityCommands = entity.cmd;

    while (entityCommands.length) {
      command = entityCommands.shift();
      command(entityCommands.shift(), entityCommands.shift());
    }

    if (entity.counter) {
      return;
    }

    updateEntitySpeed(entity);
    updateEntityPosition(entity);
  },

  updateGame = function updateGame(isAnimationFrame, len) {
    len = entities.length;

    while (len--) {
      updateEntity(entities[len]);
    }

    drawMap(isAnimationFrame);
  },

  updateIntro = function updateIntro() {
    starField();
    text(doc.title = '- GLITCHBUSTERS -', 90, 120, 2, aFrames);
    glitch(buffer);
  },

  /**
   * rendering loop
   */
  updateLoop = function updateLoop(timestamp, isFrame, isAnimationFrame) {
    frames  = Math.floor(timestamp / TIME_UNIT);
    aFrames = Math.floor(timestamp / ANIMATION_TIME_UNIT);

    isFrame           = frame   !== frames;
    isAnimationFrame  = aFrame  !== aFrames;

    if (isFrame) {
      frame   = frames;
      aFrame  = aFrames;

      bctx.fillStyle = '#000';
      bctx.fillRect(0, 0, WIDTH, HEIGHT);

      updater(isAnimationFrame);

      mctx.drawImage(buffer, 0, 0, STAGE_SCALE * WIDTH, STAGE_SCALE * HEIGHT);
    }

    win.requestAnimationFrame(updateLoop);
  },

  startLoop = function startLoop() {
    updateLoop();
  },

  getCode = function getCode(event) {
    return event.pageX ? SHOOT : event.keyCode || event.which;
  },

  setCommand = function setCommand(event, apply, code, command) {
    apply   = APPLY_TYPES.indexOf(event.type) !== -1;
    code    = getCode(event);
    command = applied[code]^apply && commands[code];

    if (!command) {
      return;
    }

    player.cmd.push(command, apply, event);

    applied[code] = apply;

    event.preventDefault();
  },

  createImage = function createImage(src, image) {
    image     = new win.Image();
    image.src = src;

    return image;
  },

  setImages = function setImages(len) {
    len = win.img.length;

    while (len--) {
      images.unshift(createImage(win.img[len]));
    }
  },

  accelerate = function accelerate(entity, newAcc, apply, acc) {
    acc     = entity.acc;
    newAcc  = newAcc.slice();

    if (apply) {
      entity.mirrored = !newAcc[0] ? entity.mirrored : newAcc[0] < 0;
    } else {
      newAcc[0] *= -1;
      newAcc[1] *= -1;
    }

    acc[0] += newAcc[0];
    acc[1] += newAcc[1];
  },

  getMouseCoords = function getMouseCoords(event) {
    return [
      Math.floor((event.pageX - main.offsetLeft)  / STAGE_SCALE),
      Math.floor((event.pageY - main.offsetTop)   / STAGE_SCALE)
    ];
  },

  shoot = function shoot(apply, event, coords, cfg) {
    if (!apply) {
      return;
    }

    coords = getMouseCoords(event);

    cfg = {
      'size' : 16,

      'friction' : 0.8,

      'idling' : {
        'frames' : 4
      }
    };

    createEntity(coords, images[2], cfg);
  },

  setCommands = function setCommands() {
    commands[UP]    = accelerate.bind(0, player, [0, -0.5]);
    commands[DOWN]  = accelerate.bind(0, player, [0,  0.5]);
    commands[LEFT]  = accelerate.bind(0, player, [-0.5, 0]);
    commands[RIGHT] = accelerate.bind(0, player, [0.5,  0]);
    commands[SPACE] = teleport;
    commands[SHOOT] = shoot;
  },

  /**
   * Creates different animations based on the original
   * player spritesheet.
   *
   * 1 - copy original sheet
   * 2 - add extra states
   * 3 - mirror sheet
   *
   * @param {Image} img
   * @return {HTMLCanvasElement}
   */
  createPlayerSprites = function createPlayerSprites(cfg, img, canvas, ctx, x, i, w, h, frames) {
    h         = img.height + cfg.size;
    canvas    = createCanvas(img.width, 2 * h);
    ctx       = canvas.getCtx();
    frames    = cfg.tping.frames;

    ctx.drawImage(img, 0, 0);

    // Create the TP animation.
    for (i = 0; i < frames; i++) {
      x = cfg.size * i;
      w = cfg.size * (frames - i) / frames;

      ctx.drawImage(
        img,
        x, // sx
        cfg.size, // sy
        cfg.size, // sw
        cfg.size, // sh
        x + cfg.size / 2 - w / 2, // dx
        img.height, // dy
        w, // dw
        cfg.size // dh
      );
    }

    // Redraw mirrored sprites.
    ctx.scale(-1,1);

    for (i = 0; i < 6; i++) {
      x = cfg.size * i;

      ctx.drawImage(
        canvas,
        x,
        0,
        cfg.size,
        h,
        -x - cfg.size,
        h,
        cfg.size,
        h
      );
    }

    return canvas;
  },

  setScreen = function setScreen(newScreen) {
    screen = newScreen;

    if (screen) {
      setCommands();
    }

    setUpdater(updaters[screen]);
  },

  /**
   * @param {Event} event
   */
  onclick = function onclick() {
    setScreen(1);
  },

  init = function init(cursor, cctx, cursorImg) {
    // Set images created by img.js
    setImages();

    // Setup cursor.
    cursorImg = images[1];
    cursor    = createCanvas(32, 32);
    cctx      = cursor.getCtx();

    cctx.drawImage(cursorImg, 0, 0, 32, 32);
    document.body.style.cursor = 'url("' + cursor.toDataURL() + '") 16 16, auto';

    // Setup main canvas.
    main    = createCanvas(STAGE_SCALE * WIDTH, STAGE_SCALE * HEIGHT);
    mctx    = main.getCtx();

    doc.body.appendChild(main);

    buffer  = createCanvas();
    bctx    = buffer.getCtx();

    // Define possible updaters.
    updaters = [
      updateIntro,
      updateGame
    ];

    // Some config for the player.
    player = {
      'size' : 16,

      'friction' : 0.8,

      'idling' : {
        'frames' : 6
      },

      'moving' : {
        'frames'  : 4,
        'y'       : 16
      },

      'tping' : {
        'frames'  : 4,
        'y'       : 32
      }
    };

    //
    // (MAP_SIZE_X * TILESIZE_X) >> 1 ===> [160, 160]
    // there should always be some room in the center
    //
    player = createEntity([160, 160], createPlayerSprites(player, images[3]), player);

    abcImage        = images[0];
    tileset         = images[4];
    win.onclick     = onclick;
    main.onmouseup  = main.onmousedown = win.onkeydown = win.onkeyup = setCommand;

    map2DArray = mapGen(MAP_SIZE_X, MAP_SIZE_Y);

    setScreen(screen);

    startLoop();
  };

win.onload = init;

//
// GRUNT WILL REMOVE FROM HERE, DO NOT REMOVE THIS!
//
// Any kind of debug logic can be placed here.
//
// On build after this block everything will be removed
// automatically by `replace` grunt task.
//
var DEBUG = true;

if (DEBUG) {
  var
    origOnload = win.onload,

    debugInit = function debugInit() {
      origOnload();

      var
        origOnkeyDown = win.onkeydown,

        debugOnkeydown = function debugOnkeydown(event) {
          var
            code = getCode(event);

          //
          // By pushing the `esc` key, you can land in sort of debug
          // mode for the whole updateLoop. The execution will step
          // by pressing the `esc` again.
          //
          if (code === 27) {
            win.requestAnimationFrame = function () {};

            updateLoop();
          }

          origOnkeyDown(event);
        };

      win.onkeydown = debugOnkeydown;
    };

  win.onload = debugInit;
}

//
// Export every function here which should be tested by karma,
//
win.test = {
  'createRoom'       : createRoom,
  'drawPath'         : drawPath,
  'entities'         : entities,
  'field'            : field,
  'getAccDirection'  : getAccDirection,
  'getId'            : getId
};