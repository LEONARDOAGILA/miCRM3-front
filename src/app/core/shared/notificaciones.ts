
import Swal from 'sweetalert2';

export class Notificaciones {

    msgSpinner: String = 'Cargando...';


    confirmationMessage(mensaje:string, textoConfirmacion:string, textoRechazar:string, metodoCorrecto:any, metodoRechazar?:any){
        Swal.fire({
          title: mensaje,
          showDenyButton: true,
          showCancelButton: false,
          confirmButtonText: textoConfirmacion,
          denyButtonText: textoRechazar,
          allowOutsideClick: false,
          customClass: {
            actions: "my-actions",
            cancelButton: "order-1 right-gap",
            confirmButton: "order-2",
            denyButton: "order-3",
          },
        }).then((result) => {
          if (result.isConfirmed) {
           metodoCorrecto();
          } else {
            metodoRechazar();
          }
        });
      }
      
      

    success(message: any) {
        Swal.fire({
            title: message,
            icon: 'success',
            confirmButtonColor: '#28B463',
        });
    }

    error(message: any) {
        Swal.fire({
            title: 'Error',
            text: message,
            icon: 'error',
            confirmButtonColor: '#d33',
        });
    }
    error2(code: any,message: any) {
        Swal.fire({
            title: 'Error: '+ code,
            text: message,
            icon: 'error',
            confirmButtonColor: '#d33',
        });
    }

    info(message: any) {
        Swal.fire({
            title: message,
            icon: 'info',
            confirmButtonColor: '#3085d6',
        });
    }

    warning(message: any) {
        Swal.fire({
            title: message,
            icon: 'warning',
            confirmButtonColor: '#F1C40F',
        });
    }

    camposVacios() {
        Swal.fire({
            title: 'Debe llenar todos los campos',
            icon: 'warning',
            confirmButtonColor: '#F1C40F',
        });
    }

    seleccionarRegistro() {
        Swal.fire({
            title: 'Debe seleccionar un registro de la tabla',
            icon: 'warning',
            confirmButtonColor: '#F1C40F',
        });
    }

    noImage() {
        Swal.fire({
            title: 'El archivo cargado no es una imagen',
            icon: 'error',
            confirmButtonColor: '#d33',
        });
    }


}




