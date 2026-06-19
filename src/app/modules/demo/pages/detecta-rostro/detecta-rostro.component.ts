import { Component, ElementRef, OnInit, ViewChild, OnDestroy } from '@angular/core';
import * as faceapi from 'face-api.js';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';

@Component({
  selector: 'app-detecta-rostro',
  templateUrl: './detecta-rostro.component.html',
  styleUrls: ['./detecta-rostro.component.css'],
  standalone:false
})
export class DetectaRostroComponent implements OnInit, OnDestroy {

  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  detectionInterval: any;

  constructor() {}

  async ngOnInit() {
    await this.cargarModelos();
    await this.pedirPermisoCamara();
    this.iniciarCamara();
  }

  async cargarModelos() {
    const MODEL_URL = '/assets/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    console.log('Modelos cargados');
  }

  /** Pide permiso de cámara usando Capacitor Core */
  async pedirPermisoCamara() {
    if (Capacitor.isNativePlatform()) {
      try {
        const permission = await Camera.requestPermissions({ permissions: ['camera'] });
        if (permission.camera !== 'granted') {
          console.warn('Permiso de cámara denegado');
        }
      } catch (err) {
        console.error('Error al pedir permiso de cámara', err);
      }
    }
  }

  iniciarCamara() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(stream => {
        const video = this.videoRef.nativeElement;
        video.srcObject = stream;
        video.play();

        video.onloadedmetadata = () => {
          const canvas = this.canvasRef.nativeElement;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          this.detectarRostro();
        };
      })
      .catch(err => console.error('Error al acceder a la cámara: ', err));
  }

  detectarRostro() {
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;

    this.detectionInterval = setInterval(async () => {
      const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      const resizedDetections = faceapi.resizeResults(detections, {
        width: video.videoWidth,
        height: video.videoHeight
      });

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
      }

    }, 200);
  }

  ngOnDestroy() {
    clearInterval(this.detectionInterval);
    const stream = this.videoRef.nativeElement.srcObject as MediaStream;
    if (stream) stream.getTracks().forEach(track => track.stop());
  }
}
