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
  let feedBack = [1, -3.89515962872624, 5.69093969755989, -3.69623536934508,0.900457760845518];
  const iirfilter = audioCtx.createIIRFilter(feedforward=feedForward, feedback=feedBack);
  var gainNode = audioCtx.createGain();
  gainNode.gain.value = 1E-05;
  var max_amplification = 5E-03;

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

  // rec_filtered = new WebAudioRecorder(gainNode, {workerDir: "scripts/lib/", encoding: "wav", numChannels: 2});
  // rec_filtered.onComplete = function(recorder, blob) {
  //     createDownloadLink(blob,recorder.encoding, "filtered")
  // }

  rec_raw.setOptions({
      timeLimit:120,
      bufferSize: 8192,
      encodeAfterRecord:true,
        ogg: {quality: 0.5},
        mp3: {bitRate: 160}
      });

  // rec_filtered.setOptions({
  //     timeLimit:60,
  //     bufferSize: 8192,
  //     encodeAfterRecord:true,
  //       ogg: {quality: 0.5},
  //       mp3: {bitRate: 160}
  //     });


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
    // drawFrequencyGraph();
    max_amplitude = Math.max.apply(Math, amplitudeData);
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
    var peaks = getPeaksAtThreshold(graphWindowData);
    heart_rate = peaks[0];
    siganl_quality = peaks[1];
    snr = peaks[2];
    // var heart_rate = peaks.length*48000*60/(2*GRAPH_WINDOW_LENGTH);
    document.getElementById("heart_rate").innerHTML = Math.floor(heart_rate);
    document.getElementById("siganl_quality").innerHTML = siganl_quality;
    document.getElementById("snr").innerHTML = Math.floor(snr*100-100);
  }
  function compute_average(arr){
    if (arr.length === 0) {
        return 0;
    }
    var sum = 0;
    for (var i = 1; i < arr.length; i++) {
      sum += arr[i];
    }
    return sum/arr.length;
  }
  function getPeaksAtThreshold(data) {
    var threshold = 0.7*Math.max.apply(null, data);
    var peaks_loc_array = [];
    var peaks_amp_array = [];
    // var length = data.length;
    for (var i = 0; i < data.length;) {
      if (data[i] > threshold) {
        peaks_loc_array.push(i);
        peaks_amp_array.push(data[i]);
        i += 0.2*48000; // Skip forward to get past this peak.
      }
      i += 100;
    }
    var period_sum = 0;
    var i_sum = 0;
    var period_list = [];
    for (var i = 2; i < peaks_loc_array.length; i+=2) {
      period_list.push(peaks_loc_array[i] - peaks_loc_array[i-2]);
    }
    heart_period = compute_average(period_list);
    heart_rate = 60*48000/heart_period;

    var period_std_sum = 0;
    for (var i = 0; i < period_list.length; i+=1) {
      period_std_sum += Math.abs(period_list[i] - heart_period);
    }
    periodic_score = period_std_sum/period_list.length;
    // normalize periodic score from 8000-30000 range to 0-1
    periodic_score = periodic_score<8000 ? 1:(periodic_score-8000);
    periodic_score = periodic_score/40000;
    // periodic_score = periodic_score>1 ? periodic_score:1;
    
    var noise_list = [];
    for (var i = 0; i < peaks_loc_array.length-1; i+=1) {
      gap_length = peaks_loc_array[i+1] - peaks_loc_array[i];
      if (gap_length > 2000){
        noise = data.slice(peaks_loc_array[i]+gap_length/2-1000, peaks_loc_array[i]+gap_length/2+1000);
        noise_list.push(compute_average(noise));
      }
    }
    let peaks_level = compute_average(peaks_amp_array);
    let noise_level = compute_average(noise_list);
    let snr = peaks_level/noise_level;
    let siganl_quality = periodic_score;
    // let siganl_quality = snr*10000/periodic_score;
    // if (peaks_loc_array.length <4 || period_list.length>17){
    //   siganl_quality = 0;
    // }
    return [heart_rate, siganl_quality, snr];
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
      echoCancellation: false,
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


