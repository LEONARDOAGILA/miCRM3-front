import Swal from "sweetalert2";

export function SweetConfirmTransaccion(title: string, status: any) {
    Swal.fire({
      allowOutsideClick: false,
      position: "center",
      icon: status,
      title: title,
      showConfirmButton: false,
    });
  }


export function TerminarTransaccion(estadoTransaccion: boolean, usu: any){
    setTimeout(() => {
        if (estadoTransaccion == true) {
          Swal.close();
        } else {
          Swal.close();
          Swal.fire({
            position: "center",
            icon: "error",
            title: "El servidor no responde",
            showConfirmButton: false,
            timer: 1500,
          });
        }
      }, 5000);
      return  usu.unsubscribe();
}




