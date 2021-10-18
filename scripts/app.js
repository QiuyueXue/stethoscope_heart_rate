// set up basic variables for app
const record = document.querySelector('.record');
const stop = document.querySelector('.stop');
const soundClips = document.querySelector('.sound-clips');
const amplitudeCanvas = document.querySelector('.visualizer');
const mainSection = document.querySelector('.main-controls');
let audioCtx;
const amplitudeCanvasCtx = amplitudeCanvas.getContext("2d");
var rec_raw;
var rec_filtered;


const audioInputSelect = document.querySelector('select#audioSource');
const selectors = [audioInputSelect];



function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const values = selectors.map(select => select.value);
  selectors.forEach(select => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });
  for (let i = 0; i !== deviceInfos.length; ++i) {
    const deviceInfo = deviceInfos[i];
    const option = document.createElement('option');
    option.value = deviceInfo.deviceId;
    if (deviceInfo.kind === 'audioinput') {
      option.text = deviceInfo.label || `microphone ${audioInputSelect.length + 1}`;
      audioInputSelect.appendChild(option);
    }
  }
  selectors.forEach((select, selectorIndex) => {
    if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
      select.value = values[selectorIndex];
    }
  });
}

function visualize(stream) {
  if(!audioCtx) {
    audioCtx = new AudioContext();
  }

  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  let feedForward = [1, 4, 6, 4, 1];
  let feedBack = [1, -3.89515962872624, 5.69093969755989, -3.69623536934508, 0.900457760845518];
  const iirfilter = audioCtx.createIIRFilter(feedforward=feedForward, feedback=feedBack);
  var gainNode = audioCtx.createGain();
  gainNode.gain.value = 1E-05;
  var max_amplification = 1E-03;

  analyser.fftSize = 2048;
  let amplitudeBufferLength = analyser.fftSize;
  let frequencyBufferLength = analyser.frequencyBinCount;
  let amplitudeData = new Uint8Array(amplitudeBufferLength);
  let frequencyData = new Uint8Array(frequencyBufferLength);

  
  amplitudeCanvas.style.width = '100%';
  amplitudeCanvas.width  = amplitudeCanvas.offsetWidth;
  const amplitudeCanvasCtx = amplitudeCanvas.getContext('2d');
  
  const GRAPH_WINDOW_LENGTH = 120000;
  let graphWindowData = new Uint8Array(GRAPH_WINDOW_LENGTH);
  let graphWindowStart = 0;

  // source.connect(analyser);

  source.connect(iirfilter);
  iirfilter.connect(gainNode);
  gainNode.connect(analyser);

  rec_raw = new WebAudioRecorder(source, {workerDir: "scripts/lib/", encoding: "wav", numChannels: 2});
  rec_raw.onComplete = function(recorder, blob) {
      createDownloadLink(blob,recorder.encoding, "raw")
  }

  rec_raw.setOptions({
      timeLimit:120,
      bufferSize: 8192,
      encodeAfterRecord:true,
        ogg: {quality: 0.5},
        mp3: {bitRate: 160}
      });

  draw();

  function draw() {
    requestAnimationFrame(draw);

    analyser.getByteTimeDomainData(amplitudeData);
    
    const offset = GRAPH_WINDOW_LENGTH - graphWindowStart;
    graphWindowData.set(amplitudeData.slice(0, offset), graphWindowStart);
    graphWindowData.set(amplitudeData.slice(offset), 0);
    graphWindowStart = (graphWindowStart + amplitudeBufferLength) % GRAPH_WINDOW_LENGTH;

    drawAmplitudeGraph();
    compute_peaks();
    max_amplitude = Math.max.apply(null, amplitudeData);
    document.getElementById('volume').addEventListener('change', function() {
        max_amplification = this.value;
    });
    auto_gain = max_amplification/max_amplitude;
    gainNode.gain.value = auto_gain;
  }

  function drawAmplitudeGraph() {
    amplitudeCanvasCtx.fillStyle = 'rgb(0, 0, 0)';
    amplitudeCanvasCtx.fillRect(0, 0, amplitudeCanvas.width, amplitudeCanvas.height);

    amplitudeCanvasCtx.lineWidth = 2;
    amplitudeCanvasCtx.strokeStyle = 'rgb(0, 255, 0)';
    amplitudeCanvasCtx.beginPath();

    const sliceWidth = amplitudeCanvas.width * 1.0 / GRAPH_WINDOW_LENGTH;
    let x = 0;
    for(let i = 0; i < GRAPH_WINDOW_LENGTH; i++) {
      const v = graphWindowData[(i + graphWindowStart) % GRAPH_WINDOW_LENGTH] / 128.0;
      const y = v * amplitudeCanvas.height/2;

      if(i === 0) {
        amplitudeCanvasCtx.moveTo(x, y);
      } else {
        amplitudeCanvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }
    amplitudeCanvasCtx.lineTo(amplitudeCanvas.width, amplitudeCanvas.height/2);
    amplitudeCanvasCtx.stroke();
  }
  function compute_peaks(){
    var peaks_locs_array, peaks_amp_array = getPeaksAtThreshold(graphWindowData);
    var heart_rate = peaks_locs_array.length*48000*60/(2*GRAPH_WINDOW_LENGTH);
    document.getElementById("heart_rate").innerHTML = heart_rate;
  }
  function indexOfMax(arr) {
    if (arr.length === 0) {
        return -1;
    }
    var max = arr[0];
    var maxIndex = 0;
    for (var i = 1; i < arr.length; i++) {
        if (arr[i] > max) {
            maxIndex = i;
            max = arr[i];
        }
    }
    return maxIndex, max;
  }
  function getPeaksAtThreshold(data) {
    var threshold = 0.8*Math.max.apply(null, data);
    var peaks_locs_array = [];
    var peaks_amp_array = [];
    for (var i = 0; i < data.length;) {
      if (data[i] > threshold) {
        tmp = data.slice(i, i+0.05*48000);
        max_loc, max_amp = indexOfMax(tmp);  //max_loc in tmp array
        peaks_locs_array.push(i+max_loc);
        peaks_amp_array.pussh(max_amp);
        i += max_loc+0.2*48000;  // Skip forward ~ 1/4s to get past this peak.
      }
      i += 100;
    }
    return peaks_locs_array, peaks_amp_array;
  }
  function countIntervalsBetweenNearbyPeaks(peaks) {
  var intervalCounts = [];
  peaks.forEach(function(peak, index){
    var interval = peaks[index + i] - peak;
    intervalCounts.push(interval);
  });
  return intervalCounts;
  }
}


function gotStream(stream) {
  window.stream = stream; // make stream available to console
  visualize(stream);
}

function handleError(error) {
  console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
}

function start() {
  // Second call to getUserMedia() with changed device may cause error, so we need to release stream before changing device
  if (window.stream) {
    stream.getAudioTracks()[0].stop();
  }

  const audioSource = audioInputSelect.value;
  
  const constraints = {
    audio: {
      deviceId: audioSource ? {exact: audioSource} : undefined,
      echoCancellation: true,
      noiseSuppression: true
    }
  };
  
  navigator.mediaDevices.getUserMedia(constraints).then(gotStream).catch(handleError);
  
}

function createDownloadLink(blob,encoding,raw_or_filtered) {
  
  var url = URL.createObjectURL(blob);
  var au = document.createElement('audio');
  var li = document.createElement('li');
  var link = document.createElement('a');
  var test_ver_ = document.getElementById("test_ver");
  var test_ver_str = test_ver_.options[test_ver_.selectedIndex].text;

  var repeat_num_ = document.getElementById("repeat_num");
  var repeat_num_str = repeat_num_.options[repeat_num_.selectedIndex].text;
  au.controls = true;
  au.src = url;
  link.href = url;
  link.download = new Date().toISOString() + '_' +test_ver_str + '_' + repeat_num_str +'_' + raw_or_filtered + '.'+encoding;
  link.innerHTML = link.download;
  li.appendChild(au);
  li.appendChild(link);
  recordingsList.appendChild(li);
}



audioInputSelect.onchange = start;
  
startRecord.onclick = e => {
  startRecord.disabled = true;
  stopRecord.disabled=false;
  audioChunks = [];
  rec_raw.startRecording();
  // rec_filtered.startRecording();
}
stopRecord.onclick = e => {
  startRecord.disabled = false;
  stopRecord.disabled=true;
  rec_raw.finishRecording();
  // rec_filtered.finishRecording();
}

navigator.mediaDevices.enumerateDevices()
.then(gotDevices)
.then(start)
.catch(handleError);


