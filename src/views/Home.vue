<template>
  <div id="app" class="show-monitor-box show-loading-progress " style="position: absolute">
    <div id="wrapper">
      <canvas id="stage"></canvas>
      <div id="monitors"></div>
      <div id="asking-box">
        <label id="question" for="answer">问题</label>
        <input type="text" id="answer" />
      </div>
      <div class="buttons">
        <div id="start-btn" style="width: 24px;height: 24px;cursor: pointer;margin: 5px;" @click="start">开始</div>
        <div id="stop-btn" style="width: 24px;height: 24px;cursor: pointer;margin: 5px;" @click="stop">结束</div>
      </div>
    </div>
    <div v-if="loading" class="loading">
      <img src="@/assets/image/loading.gif"/>
    </div>
  </div>
</template>

<script>
import axios from 'axios'

const ScratchRender = require('scratch-render/dist/web/scratch-render');
const VirtualMachine = require('scratch-vm/dist/web/scratch-vm');
const ScratchStorage = require('scratch-storage/dist/web/scratch-storage');
const ScratchSVGRenderer = require('scratch-svg-renderer/dist/web/scratch-svg-renderer');
const AudioEngine = require('scratch-audio/src/AudioEngine');
export default {
  name: 'App',
  data() {
    return {
      loading: true,
      vm: null,
      canvas: null,
      renderer: null,
      height: 360,
      width: 480,
      accumulative: { x: 0, y: 0 },
      mouseDown: false,
      mouseDownPosition: null,
      mouseDownTimeoutId: null,
      isDragging: false,
      dragId: null,
      dragOffset: null,
      keyToCode: new Map(),
    }
  },
  mounted() {
    let scratchUrl = "/scratch.sb3";
    axios.request({
      url: scratchUrl,
      method: 'get',
      responseType: 'blob'
    }).then(res => {
      const blob = new Blob([res.data])
      window.devicePixelRatio = 1;
      let canvas = document.getElementById('stage');
      this.canvas = canvas;
      let audioEngine = new AudioEngine();
      let renderer = new ScratchRender(canvas);
      this.renderer = renderer;
      let vm = new VirtualMachine();
      let storage = new ScratchStorage();
      this.vm = vm;
      this.vm.attachAudioEngine(audioEngine);
      this.vm.attachStorage(storage);
      this.vm.attachRenderer(renderer);
      this.vm.attachV2SVGAdapter(new ScratchSVGRenderer.SVGRenderer());
      this.vm.attachV2BitmapAdapter(new ScratchSVGRenderer.BitmapAdapter());
      this.bindHandle();
      let reader = new FileReader();
      console.log('reader',reader)
      //byte为blob对象
      reader.readAsArrayBuffer(blob);

      reader.onload = () => {
        this.vm.start();
        this.vm.loadProject(reader.result).then(()=>{
          this.loading = false
        });
        canvas.height = window.innerHeight
        canvas.width = window.innerHeight / this.height * this.width

        this.resize();
        this.runQuestion();
        this.showMonitorStates();
      }
    });
  },
  methods: {
    // 绑定事件
    bindHandle() {
      document.addEventListener('mousemove', this.handleMouseMove)
      document.addEventListener('mouseup', this.handleMouseUp)
      document.addEventListener('touchmove', this.handleMouseMove)
      document.addEventListener('touchend', this.handleMouseUp, { passive: false })
      this.canvas.addEventListener('wheel', event => {
        this.vm.postIOData('mouseWheel', event)
        event.preventDefault()
      })
      window.addEventListener('resize', this.resize)
      this.canvas.addEventListener('contextmenu', event => {
        event.preventDefault()
      })
      document.addEventListener('keydown', event => {
        if (event.target !== document && event.target !== document.body) return
        const prevCode = this.keyToCode.get(event.key)
        if (prevCode) {
          if (prevCode !== event.code) {
            this.vm.postIOData('keyboard', {
              key: 'code_' + prevCode,
              isDown: false
            })
          }
        }
        this.postKey(event, true)
        this.keyToCode.set(event.key, event.code)
        if (event.keyCode === 32 || (event.keyCode >= 37 && event.keyCode <= 40)) {
          event.preventDefault()
        }
        if (
            event.key === 'f' &&
            (event.ctrlKey || event.metaKey) &&
            !event.shiftKey &&
            !event.altKey
        ) {
          event.preventDefault()
        }
      })
      document.addEventListener('keyup', e => {
        this.postKey(e, false)
        this.keyToCode.delete(e.key)
        if (e.target !== document && e.target !== document.body) {
          e.preventDefault()
        }
      })
      this.canvas.addEventListener('mousedown', this.handleMouseDown)
      this.canvas.addEventListener('touchstart', this.handleMouseDown, { passive: false })
    },
    handleMouseDown (event) {
      this.mouseDown = true
      this.vm.postIOData('keyboard', {
        key: 'Mouse' + event.which,
        isDown: true
      })
      if (this.postIfPointerLocked(event, true)) return
      this.mouseDownPosition = this.postMouse(event, true).mousePosition
      this.mouseDownTimeoutId = setTimeout(this.handleStartDrag, 400)
      event.preventDefault()
      if (!document.body.classList.contains('asking')) {
        window.focus()
      }
    },
    postKey (event, isDown) {
      const key = !event.key || event.key === 'Dead' ? event.keyCode : event.key
      this.vm.postIOData('keyboard', {
        key: key,
        isDown
      })
      this.vm.postIOData('keyboard', {
        key: 'code_' + event.code,
        isDown
      })
    },
    handleMouseUp (event) {
      this.cancelMouseDownTimeout()
      this.mouseDown = false
      this.mouseDownPosition = null
      if (this.isDragging) {
        this.vm.stopDrag(this.dragId)
        this.isDragging = false
        this.dragOffset = null
        this.dragId = null
      }
      this.vm.postIOData('keyboard', {
        key: 'Mouse' + event.which,
        isDown: false
      })
      if (this.postIfPointerLocked(event, false)) return
      this.postMouse(event, false)
    },
    handleMouseMove (event) {
      if (this.postIfPointerLocked(event)) return
      const { mousePosition, rect } = this.postMouse(event)
      if (this.mouseDown && !this.isDragging) {
        const distanceFromMouseDown = Math.hypot(
            mousePosition.x - this.mouseDownPosition.x,
            mousePosition.y - this.mouseDownPosition.y
        )
        if (distanceFromMouseDown > 3) {
          this.cancelMouseDownTimeout()
          this.handleStartDrag()
        }
      }
      if (this.mouseDown && this.isDragging) {
        const nativeSize = this.renderer.getNativeSize()
        this.vm.postSpriteInfo({
          x:
              (nativeSize[0] / rect.width) * (mousePosition.x - rect.width / 2) +
              this.dragOffset[0],
          y: -(
              (nativeSize[1] / rect.height) * (mousePosition.y - rect.height / 2) +
              this.dragOffset[1]
          ),
          force: true
        })
      }
    },
    handleStartDrag () {
      if (this.dragId || !this.mouseDownPosition) return
      const drawableId = this.renderer.pick(this.mouseDownPosition.x, this.mouseDownPosition.y)
      if (drawableId === null) return
      const targetId = this.vm.getTargetIdForDrawableId(drawableId)
      if (targetId === null) return
      const target = this.vm.runtime.getTargetById(targetId)
      if (!target || !target.draggable) return
      target.goToFront()
      const drawableData = this.renderer.extractDrawable(
          drawableId,
          this.mouseDownPosition.x,
          this.mouseDownPosition.y
      )
      this.vm.startDrag(targetId)
      this.isDragging = true
      this.dragId = targetId
      this.dragOffset = drawableData.scratchOffset
    },
    cancelMouseDownTimeout () {
      if (this.mouseDownTimeoutId !== null) {
        clearTimeout(this.mouseDownTimeoutId)
      }
      this.mouseDownTimeoutId = null
    },
    postMouse (event, isDown) {
      const { x, y } = this.getEventXY(event)
      const rect = this.canvas.getBoundingClientRect()
      const mousePosition = { x: x - rect.left, y: y - rect.top }
      this.vm.postIOData('mouse', {
        isDown,
        ...mousePosition,
        canvasWidth: rect.width,
        canvasHeight: rect.height
      })
      return { mousePosition, rect }
    },
    getEventXY(e) {
      if (e.touches && e.touches[0]) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY }
      } else if (e.changedTouches && e.changedTouches[0]) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
      }
      return { x: e.clientX, y: e.clientY }
    },
    postIfPointerLocked (e, isDown) {
      if (
          document.pointerLockElement === this.canvas ||
          document.mozPointerLockElement === this.canvas
      ) {
        this.accumulative.x += e.movementX
        this.accumulative.y += e.movementY
        this.vm.postIOData('mouse', {
          isDown,
          x: this.accumulative.x + this.width / 2,
          y: this.accumulative.y + this.height / 2,
          canvasWidth: this.width,
          canvasHeight: this.height
        })
        return true
      } else {
        return false
      }
    },
    resize(){
      const monitorWrapper = document.getElementById('monitors')
      const canvas = document.getElementById('stage')
      const rect = canvas.getBoundingClientRect()
      monitorWrapper.style.transform = `scaleX(${rect.width / 480}) scaleY(${rect.height / 360})`
    },
    runQuestion(){
      const question = document.getElementById('question')
      const askBox = document.getElementById('answer')
      this.vm.runtime.addListener('QUESTION', questionData => {
        // null means the question was interrupted by stop script block
        if (questionData === null) {
          document.body.classList.remove('asking')
        } else {
          document.body.classList.add('asking')
          question.textContent = questionData
          askBox.value = ''
          askBox.focus()
        }
      })
      askBox.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          // The asking class must be removed first because the VM may start the
          // next question immediately inside the .emit call
          document.body.classList.remove('asking')
          this.vm.runtime.emit('ANSWER', askBox.value)
        }
      })
    },
    showMonitorStates() {
      const vm = this.vm
      const monitorWrapper = document.getElementById('monitors')
      const getVariable = (targetId, variableId) => {
        const target = targetId
            ? vm.runtime.getTargetById(targetId)
            : vm.runtime.getTargetForStage()
        return target.variables[variableId]
      }
      const monitorStates = {}
      this.vm.runtime.addListener('MONITORS_UPDATE', monitors => {
        monitors.forEach((record, id) => {
          const {
            value,
            visible,
            mode,
            x,
            y,
            width,
            height,
            params,
            opcode,
            spriteName,
            sliderMin,
            sliderMax,
            isDiscrete,
            targetId
          } = record

          if (!monitorStates[id]) {
            const label = document.createElement('span')
            label.className = 'monitor-label'
            const name = params.VARIABLE || params.LIST || opcode
            label.textContent = spriteName ? `${spriteName}: ${name}` : name

            const value = document.createElement('span')
            value.className = 'monitor-value'

            const monitor = document.createElement('div')
            monitor.className = 'monitor ' + mode
            monitor.style.left = x + 'px'
            monitor.style.top = y + 'px'
            monitor.append(label, value)

            monitorStates[id] = {monitor, valueElem: value, wasVisible: true}

            if (mode === 'slider') {
              const slider = document.createElement('input')
              slider.type = 'range'
              slider.min = sliderMin
              slider.max = sliderMax
              slider.step = isDiscrete ? 1 : 0.01
              // Prevent tab focus, per #54, but it deviates from Scratch
              slider.tabIndex = -1
              slider.addEventListener('input', () => {
                getVariable(targetId, id).value = slider.value
              })
              slider.addEventListener('change', () => {
                getVariable(targetId, id).value = slider.value
              })
              monitorStates[id].slider = slider
              monitor.append(slider)
            } else if (mode === 'list') {
              // If the list has never been resized, the width/height will be 0.
              // Weird!
              monitor.style.width = (width || 100) + 'px'
              monitor.style.height = (height || 200) + 'px'

              monitorStates[id].rowElems = []
            }

            monitorWrapper.append(monitor)
          }

          const {
            monitor,
            valueElem,
            wasVisible,
            lastValue = [],
            slider,
            rowElems
          } = monitorStates[id]
          if (visible) {
            if (!wasVisible) {
              monitor.style.display = null
            }
            const differed = Array.isArray(value)
                ? JSON.stringify(lastValue) !== JSON.stringify(value)
                : lastValue !== value
            if (differed) {
              if (Array.isArray(value)) {
                if (lastValue.length !== rowElems.length) {
                  console.error(
                      "List monitor rowElems and lastValue lengths don't match."
                  )
                }

                value.forEach((val, i) => {
                  if (i >= lastValue.length) {
                    // Could also set width to (lastValue.length + '').length + 'ch'
                    const index = document.createElement('div')
                    index.className = 'index'
                    index.textContent = i + 1

                    const value = document.createElement('div')
                    value.className = 'row-value'

                    const row = document.createElement('div')
                    row.className = 'row'
                    row.append(index, value)

                    valueElem.append(row)
                    rowElems[i] = value
                  }

                  if (lastValue[i] !== val) {
                    rowElems[i].textContent = val
                  }
                })

                if (value.length < lastValue.length) {
                  for (const toRemove of rowElems.splice(
                      value.length,
                      lastValue.length - value.length
                  )) {
                    toRemove.parentNode.remove()
                  }
                }
              } else {
                // The HTMLifier used to use Number(value.toFixed(6)) but I don't
                // think Scratch does that for monitors
                valueElem.textContent = value
                if (slider) {
                  slider.value = value
                }
              }
            }
          } else if (wasVisible) {
            monitor.style.display = 'none'
          }
          monitorStates[id].wasVisible = visible
          // `value` is a live array
          monitorStates[id].lastValue = Array.isArray(value) ? [...value] : value
        })
      })
    },
    start() {
      this.vm.greenFlag(); // 运行
    },
    stop() {
      this.vm.stopAll(); // 停止所有
    }
  }
}
</script>

<style>
html,
body {
  height: 100%;
}
body,
::backdrop {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: black;
  font-size: 0;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  overflow: hidden;
  background-position: center;
  background-size: cover;
}
#wrapper {
  display: block;
  position: relative;
}
.no-cursor #wrapper {
  cursor: none;
}
.loading #wrapper {
  visibility: hidden;
}
.stretch-stage #wrapper {
  width: 100vw;
  height: 100vh;
}
/* CSS for proportional wrapper scaling is added dynamically by htmlifier.ts */
#monitors {
  position: absolute;
  top: 0;
  left: 0;
}
#stage {
  width: 100%;
  height: 100%;
}
#loading-progress {
  display: none;
  position: fixed;
  bottom: 20px;
  left: 20px;
  right: 20px;
  border-radius: 20px;
  --progress: 0%;
  z-index: 100;
}
.show-loading-progress #loading-progress {
  display: block;
}
#loading-progress::before {
  content: attr(data-progress);
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 1.5rem;
  margin-bottom: 15px;
}
#loading-progress::after {
  content: '';
  display: block;
  height: 16px;
  border-radius: 20px;
  width: var(--progress);
}
#loading-image {
  position: fixed;
  max-width: 100%;
  max-height: 100%;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  margin: auto;
}
.stretch-loading-image #loading-image {
  width: 100%;
  height: 100%;
}
.buttons {
  position: absolute;
  top: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.5);
  border-bottom-left-radius: 12px;
}
.buttons .button,
.buttons button {
  display: none;
  -webkit-appearance: none;
  border: none;
  background: none;
  width: 48px;
  height: 48px;
  cursor: pointer;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 24px;
}
.buttons button:disabled,
#add-sprite-file:disabled + #add-sprite-btn {
  cursor: auto;
  opacity: 0.5;
}
#start-btn {
  background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"%3E%3Cpath d="M8 5v14l11-7z" fill="%23fff"/%3E%3C/svg%3E%0A');
}
.running #start-btn {
  background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"%3E%3Cpath d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="%23fff"/%3E%3C/svg%3E');
}
#stop-btn {
  background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"%3E%3Cpath d="M6 6h12v12H6z" fill="%23fff"/%3E%3C/svg%3E%0A');
}
#fullscreen-btn {
  background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"%3E%3Cpath d="M14 28h-4v10h10v-4h-6v-6zm-4-8h4v-6h6v-4H10v10zm24 14h-6v4h10V28h-4v6zm-6-24v4h6v6h4V10H28z" fill="%23fff"/%3E%3C/svg%3E');
}
.fullscreen #fullscreen-btn {
  background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"%3E%3Cpath d="M10 32h6v6h4V28H10v4zm6-16h-6v4h10V10h-4v6zm12 22h4v-6h6v-4H28v10zm4-22v-6h-4v10h10v-4h-6z" fill="%23fff"/%3E%3C/svg%3E');
}
#download-btn {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fff'%3E%3Cpath d='M5,20h14v-2H5V20z M19,9h-4V3H9v6H5l7,7L19,9z'/%3E%3C/svg%3E");
}
#add-sprite-btn {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23fff'%3E%3Cpath d='M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z'/%3E%3C/svg%3E");
}
#add-sprite-file {
  display: none;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
.show-start-stop-btns #start-btn,
.show-start-stop-btns #stop-btn,
.show-fullscreen-btn #fullscreen-btn,
.show-download-btn #download-btn,
.show-add-sprite-btn #add-sprite-btn,
.show-add-sprite-btn #add-sprite-file {
  display: inline-block;
}
.monitor {
  position: absolute;
  border: 1px solid transparent;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  overflow: hidden;
  padding: 3px;
  white-space: pre;
}
.show-monitor-box .monitor {
  border-color: rgba(0, 0, 0, 0.2);
  background-color: rgba(0, 0, 0, 0.3);
}
.monitor-label {
  margin: 0 5px;
  font-weight: bold;
}
.monitor-value {
  display: inline-block;
  vertical-align: top;
  min-width: 34px;
  text-align: center;
  border-radius: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: text;
  transform: translateZ(0);
}
.default .monitor-value,
.slider .monitor-value {
  margin: 0 5px;
  padding: 1px 3px;
}
.show-monitor-box .default .monitor-value,
.show-monitor-box .slider .monitor-value {
  background-color: rgba(0, 0, 0, 0.5);
}
.large {
  padding: 0.1rem 0.25rem;
  min-width: 3rem;
}
.show-monitor-box .large {
  background-color: rgba(0, 0, 0, 0.6);
}
.large .monitor-label {
  display: none;
}
.large .monitor-value {
  font-size: 1rem;
  width: 100%;
}
.list {
  padding: 0;
  overflow: auto;
  overflow-x: hidden;
}
.list .monitor-label {
  text-align: center;
  padding: 3px;
  width: 100%;
  display: block;
  margin: 0;
  box-sizing: border-box;
  white-space: pre-wrap;
}
.list .monitor-value {
  display: block;
}
.row {
  display: flex;
  align-items: center;
  padding: 2px;
  height: 24px;
  box-sizing: border-box;
  transform: translateZ(0);
}
.index {
  font-weight: bold;
  margin: 0 3px;
  flex: none;
}
.row-value {
  flex: auto;
  margin: 0 3px;
  text-align: left;
  border-radius: 0.25rem;
  border: 1px solid transparent;
  height: 22px;
  padding: 3px 5px;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
}
.show-monitor-box .row-value {
  border-color: rgba(0, 0, 0, 0.2);
  background-color: rgba(0, 0, 0, 0.5);
}
.slider input {
  display: block;
  width: 100%;
  transform: translateZ(0);
}
#asking-box {
  display: none;
  position: absolute;
  left: 0;
  bottom: 0;
  right: 0;
  background-color: rgba(33, 33, 33, 0.7);
}
.asking #asking-box {
  display: block;
}
#question {
  display: block;
  margin: 0 10px;
  margin-top: 10px;
  font-size: 12px;
  color: white;
}
#answer {
  border: none;
  background: none;
  width: 100%;
  font: inherit;
  font-size: 16px;
  color: white;
  padding: 10px;
  box-sizing: border-box;
}
#answer:focus {
  outline: none;
}
#errors {
  -webkit-appearance: none;
  border: none;
  background: rgba(255, 0, 0, 0.7);
  color: white;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  display: none;
}
#wrapper { position: relative;width: 100vw; height: 75vw; }
@media (min-aspect-ratio: 480/360) {
  #wrapper {
    position: relative;
    height: 100vh;
    width: 133.33333333333331vh;
    left: calc((100vw - 133.33333333333331vh) / 2);
  }
}
#loading-progress {
  border: 1px solid #67C23A;
}
#loading-progress::before {
  color: #67C23A;
}
#loading-progress::after {
  background-color: #67C23A;
}
.monitor {
  color: #ffffff;
}

.loading {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
