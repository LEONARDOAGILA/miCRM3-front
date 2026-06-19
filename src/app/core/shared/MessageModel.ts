import Swal from "sweetalert2";

export class MenssageModel {
  public code: number;
  public status: string;
  public message: string;
  public data: Object;
  public icon: any;
  public color: string;

  // static messageEncodeJson(obj: Object) {
  //   return new MenssageModel(
  //       obj["code"],
  //       obj["status"],
  //       obj["message"],
  //       obj["data"],
  //       obj["icon"],
  //       obj["color"]
  //       );
  // }

  constructor( ) {
    this.code = 0 ,
    this.status = "",
    this.message = "",
    this.data = {},
    this.icon ,
    this.color = ""
  }

  get getMsg(){
    return Swal.fire({
      title: this.message,
      icon: this.icon,
      confirmButtonColor: this.color,
    });
  }

  getMessege() {
    return Swal.fire({
      title: this.message,
      icon: this.icon,
      confirmButtonColor: this.color,
    });
  }

  public getMessegeException(msg: string): void{
    this.code = 500;
    this.status = msg;
    this.message = msg;
    this.data = [];
    this.icon = 'error';
    this.color = 'red';
    this.getMessege();
  }


  public getMessegeError(msg: string): void{
    this.code = 500;
    this.status = msg;
    this.message = msg;
    this.data = [];
    this.icon = 'error';
    this.color = 'red';
    this.getMessege();
  }

  public getMessegeOk(msg: string): void{
    this.code = 200;
    this.status = msg;
    this.message = msg;
    this.data = [];
    this.icon = 'success';
    this.color = 'green';
    this.getMessege();
  }


}
