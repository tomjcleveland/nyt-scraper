const net = require("net");

class Client {
  constructor(params) {
    this.controlPort = params.controlPort;
    this.password = params.password;

    this.client = net.connect(params.controlPort, function () {
      console.log("Connected to tor control interface.");
      console.log("Authenticating...");

      this.write('AUTHENTICATE "' + params.password + '"\r\n');
    });

    this.client.on("data", (data) => {
      var message = data.toString().trim();

      if (message !== "250 OK") {
        console.log("error", message);
      } else if (this.authenticated) {
        console.log("message", message);
      } else {
        console.log("Authenticated successfully");
        this.authenticated = true;
      }
    });

    this.client.on("error", (err) => {
      console.log(err);
    });
  }

  changeIp() {
    this.client.write("SIGNAL NEWNYM\r\n");
  }
}

exports.Client = Client;
