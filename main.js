// importa as bibliotecas necessárias
const serialport = require("serialport");
const express = require("express");
const mysql = require("mysql2");

// constantes para configurações
const SERIAL_BAUD_RATE = 9600;
const SERVIDOR_PORTA = 3300;

// habilita ou desabilita a inserção de dados no banco de dados
const HABILITAR_OPERACAO_INSERIR = true;

// fator de conversão de lux para PPFD
// valor aproximado para LED Full Spectrum
const FATOR_LUX_PARA_PPFD = 0.0185;

// ID do sensor cadastrado no banco
const ID_SENSOR = 1;

// função para comunicação serial
const serial = async (valoresSensorLuminosidade) => {
  // conexão com o banco de dados MySQL
  let poolBancoDados = mysql
    .createPool({
      host: "localhost",
      user: "aluno",
      password: "Sptech#2024",
      database: "sistema_lumi",
      port: 3307,
    })
    .promise();

  // lista as portas seriais disponíveis e procura pelo Arduino
  const portas = await serialport.SerialPort.list();
  const portaArduino = portas.find(
    (porta) => porta.vendorId == 2341 && porta.productId == 43
  );

  // se não encontrar o Arduino, mostra erro
  if (!portaArduino) {
    throw new Error("O arduino não foi encontrado em nenhuma porta serial");
  }

  // configura a porta serial com o baud rate especificado
  const arduino = new serialport.SerialPort({
    path: portaArduino.path,
    baudRate: SERIAL_BAUD_RATE,
  });

  // evento quando a porta serial é aberta
  arduino.on("open", () => {
    console.log(
      `A leitura do arduino foi iniciada na porta ${portaArduino.path} utilizando Baud Rate de ${SERIAL_BAUD_RATE}`
    );
  });

  // processa os dados recebidos do Arduino
  arduino
    .pipe(new serialport.ReadlineParser({ delimiter: "\r\n" }))
    .on("data", async (data) => {
      try {
        console.log("Valor recebido:", data);

        const valorAnalogico = parseFloat(data.trim());

        // verifica se o valor recebido é válido
        if (isNaN(valorAnalogico)) {
          console.log("Valor inválido recebido do Arduino.");
          return;
        }

        // ============================
        // CONVERSÃO DE ANALÓGICO PARA LUX
        // ============================

        // converte a leitura analógica em tensão
        const tensao = valorAnalogico * (5.0 / 1023.0);

        // variável que vai guardar o valor de lux
        let sensorLuminosidade = 0;

        // evita divisão por zero
        if (tensao > 0) {
          // calcula a resistência do LDR
          const resistenciaLDR = 10000.0 * (5.0 / tensao - 1.0);

          // converte a resistência em lux
          sensorLuminosidade = 500.0 / (resistenciaLDR / 1000.0);
        }

        // calcula o PPFD com base no lux
        const ppfd = sensorLuminosidade * FATOR_LUX_PARA_PPFD;

        // armazena os dados no array
        valoresSensorLuminosidade.push({
          valorAnalogico: valorAnalogico,
          lux: sensorLuminosidade,
          ppfd: ppfd,
          dataHora: new Date(),
        });

        // mantém apenas os últimos 100 registros
        if (valoresSensorLuminosidade.length > 100) {
          valoresSensorLuminosidade.shift();
        }

        // insere os dados no banco de dados
        if (HABILITAR_OPERACAO_INSERIR) {
          await poolBancoDados.execute(
            "INSERT INTO Leituras (fk_sensor, lux, ppfd, data_hora) VALUES (?, ?, ?, NOW())",
            [ID_SENSOR, sensorLuminosidade, ppfd]
          );

          console.log("Valores inseridos no banco:", {
            id_Sensor: ID_SENSOR,
            lux: sensorLuminosidade,
            ppfd: ppfd,
          });
        }
      } catch (erro) {
        console.error("Erro ao processar leitura:", erro.message);
      }
    });

  // evento para lidar com erros na comunicação serial
  arduino.on("error", (mensagem) => {
    console.error(`Erro no Arduino (Mensagem: ${mensagem})`);
  });
};

// função para criar e configurar o servidor web
const servidor = (valoresSensorLuminosidade) => {
  const app = express();

  // configurações de requisição e resposta
  app.use((request, response, next) => {
    response.header("Access-Control-Allow-Origin", "*");
    response.header(
      "Access-Control-Allow-Headers",
      "Origin, Content-Type, Accept"
    );
    next();
  });

  // inicia o servidor na porta especificada
  app.listen(SERVIDOR_PORTA, () => {
    console.log(`API executada com sucesso na porta ${SERVIDOR_PORTA}`);
  });

  // endpoint da API
  app.get("/sensores/analogico", (_, response) => {
    return response.json(valoresSensorLuminosidade);
  });

  // rota de teste
  app.get("/", (_, response) => {
    return response.send("API do Farmino funcionando 🌱");
  });
};

// função principal assíncrona para iniciar a comunicação serial e o servidor web
(async () => {
  // array para armazenar os valores dos sensores
  const valoresSensorLuminosidade = [];

  // inicia a comunicação serial
  await serial(valoresSensorLuminosidade);

  // inicia o servidor web
  servidor(valoresSensorLuminosidade);
})();