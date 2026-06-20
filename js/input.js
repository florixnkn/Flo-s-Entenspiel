// js/input.js — Keyboard state tracker. Attach once; poll each frame.

var Input = (function () {
  var _down = {};   // key → true while held
  var _pressed = {}; // key → true for the ONE frame it was first pressed
  var _released = {}; // key → true for the ONE frame it was released

  function _onKeyDown(e) {
    if (!_down[e.code]) {
      _pressed[e.code] = true;
    }
    _down[e.code] = true;
    // Prevent page scroll on space/arrow keys
    if (e.code === "Space" || e.code === "ArrowLeft" || e.code === "ArrowRight") {
      e.preventDefault();
    }
  }

  function _onKeyUp(e) {
    _down[e.code] = false;
    _released[e.code] = true;
  }

  window.addEventListener("keydown", _onKeyDown);
  window.addEventListener("keyup",   _onKeyUp);

  return {
    // Call at the END of each game-loop tick to clear one-frame flags.
    flush: function () {
      _pressed  = {};
      _released = {};
    },

    // Held this frame
    held: function (code) { return !!_down[code]; },

    // Became pressed this frame (rising edge)
    pressed: function (code) { return !!_pressed[code]; },

    // Was released this frame (falling edge)
    released: function (code) { return !!_released[code]; },
  };
}());
