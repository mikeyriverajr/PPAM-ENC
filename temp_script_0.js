
  var currentUserRole = '';
  var rawRequestsData = [];

  document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('btn-login-user').addEventListener('click', function() { validarPin('user'); });
    document.getElementById('btn-login-admin').addEventListener('click', function() { validarPin('admin'); });
    document.getElementById('btn-logout').addEventListener('click', cerrarSesion);

    document.getElementById('link-show-admin').addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('user-login-box').style.display = 'none';
      document.getElementById('admin-login-box').style.display = 'block';
      document.getElementById('login-error').style.display = 'none';
    });

    document.getElementById('link-show-user').addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('admin-login-box').style.display = 'none';
      document.getElementById('user-login-box').style.display = 'block';
      document.getElementById('login-error').style.display = 'none';
    });

    document.getElementById('btn-show-request').addEventListener('click', function() {
      document.getElementById('req-nombre').value = localStorage.getItem('pasajeroNombre') || '';
      document.getElementById('req-tel').value = localStorage.getItem('pasajeroTel') || '';
      document.getElementById('req-notas').value = '';
      document.getElementById('date-warning').style.display = 'none';
      showView('request-view');
    });

    document.getElementById('req-fecha').addEventListener('change', function() {
      var val = this.value;
      if(!val) return;
      var parts = val.split('-');
      var d = new Date(parts[0], parts[1]-1, parts[2]);
      var day = d.getDay();
      if (day !== 4 && day !== 6) {
        document.getElementById('date-warning').style.display = 'block';
      } else {
        document.getElementById('date-warning').style.display = 'none';
      }
    });

    document.getElementById('switch-past-trips').addEventListener('change', actualizarVisibilidadPasados);

    document.getElementById('btn-submit-req').addEventListener('click', enviarSolicitud);
    document.getElementById('btn-back-1').addEventListener('click', loadBoard);
    document.getElementById('btn-confirm-claim').addEventListener('click', confirmarViaje);
    document.getElementById('btn-cancel-claim').addEventListener('click', cancelarViaje);
    document.getElementById('btn-gps').addEventListener('click', obtenerGPS);

    document.getElementById('btn-copy-wa').addEventListener('click', copiarResumenWhatsApp);
    document.getElementById('btn-save-emails').addEventListener('click', guardarCorreosAdmin);
    document.getElementById('btn-save-edit').addEventListener('click', guardarEdicionAdmin);

    var savedPin = localStorage.getItem('appAuthPin');
    var savedType = localStorage.getItem('appAuthType');

    if (savedPin && savedType) {
      document.getElementById('user-login-box').style.display = 'none';
      document.getElementById('admin-login-box').style.display = 'none';
      document.getElementById('auto-login-msg').style.display = 'block';

      google.script.run
        .withSuccessHandler(function(role) {
          if (role === savedType) {
            iniciarSesionExitosa(role, savedPin);
          } else {
            cerrarSesion();
          }
        })
        .withFailureHandler(function(error) {
          cerrarSesion();
          mostrarAlerta("Error de conexión automática.");
        })
        .verifyPin(savedPin);
    }
  });

  function mostrarAlerta(mensaje) {
    document.getElementById('alertaMensaje').innerText = mensaje;
    var myModal = new bootstrap.Modal(document.getElementById('alertaModal'));
    myModal.show();
  }

  function showView(viewId) {
    var sections = document.querySelectorAll('.view-section');
    for (var i = 0; i < sections.length; i++) {
      sections[i].style.display = 'none';
    }
    document.getElementById(viewId).style.display = 'block';
    document.getElementById('driver-form').style.display = 'none';
  }

  function validarPin(tipoIngreso) {
    var pin = (tipoIngreso === 'admin') ? document.getElementById('admin-pin-input').value : document.getElementById('pin-input').value;
    var errorDiv = document.getElementById('login-error');
    if (errorDiv) errorDiv.style.display = 'none';

    google.script.run
      .withSuccessHandler(function(role) {
        if (role === tipoIngreso) {
          iniciarSesionExitosa(role, pin);
        } else if (role === 'admin' && tipoIngreso === 'user') {
          errorDiv.innerText = 'Ese es un PIN de administrador. Usa el enlace "Acceso de Administrador" debajo.';
          errorDiv.style.display = 'block';
        } else if (role === 'user' && tipoIngreso === 'admin') {
          errorDiv.innerText = 'Ese es un PIN de usuario normal.';
          errorDiv.style.display = 'block';
        } else {
          errorDiv.innerText = 'PIN incorrecto.';
          errorDiv.style.display = 'block';
        }
      })
      .withFailureHandler(function(error) {
        mostrarAlerta("Error de conexión: " + error.message);
      })
      .verifyPin(pin);
  }

  function iniciarSesionExitosa(role, pin) {
    currentUserRole = role;
    localStorage.setItem('appAuthPin', pin);
    localStorage.setItem('appAuthType', role);

    if(role === 'admin') {
      document.getElementById('admin-panel').style.display = 'block';
      google.script.run.withSuccessHandler(function(emails) {
        document.getElementById('admin-emails-input').value = emails;
      }).getAdminEmails(pin);
    } else {
      document.getElementById('admin-panel').style.display = 'none';
    }
    loadBoard();
  }

  function cerrarSesion() {
    localStorage.removeItem('appAuthPin');
    localStorage.removeItem('appAuthType');
    currentUserRole = '';

    document.getElementById('pin-input').value = '';
    document.getElementById('admin-pin-input').value = '';
    document.getElementById('auto-login-msg').style.display = 'none';
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('user-login-box').style.display = 'block';

    showView('login-view');
  }

  function guardarCorreosAdmin() {
    var pin = localStorage.getItem('appAuthPin');
    var emails = document.getElementById('admin-emails-input').value;
    google.script.run.withSuccessHandler(function() {
      mostrarAlerta('Lista de correos actualizada correctamente.');
    }).updateAdminEmails(pin, emails);
  }

  function obtenerGPS() {
    if (navigator.geolocation) {
      document.getElementById('req-ubicacion').value = "Buscando satélites...";
      navigator.geolocation.getCurrentPosition(
        function(position) {
          var lat = position.coords.latitude;
          var lon = position.coords.longitude;
          document.getElementById('req-ubicacion').value = 'https://www.google.com/maps?q=' + lat + ',' + lon;
        },
        function(error) {
          document.getElementById('req-ubicacion').value = "";
          mostrarAlerta('No se pudo acceder al GPS. Asegúrate de darle permisos al navegador.');
        }
      );
    } else {
      mostrarAlerta('Tu navegador no soporta ubicación GPS.');
    }
  }

  function enviarSolicitud() {
    var data = {
      nombre: document.getElementById('req-nombre').value,
      fecha: document.getElementById('req-fecha').value,
      pasajeros: document.getElementById('req-pasajeros').value,
      tipo: document.getElementById('req-tipo').value,
      ubicacion: document.getElementById('req-ubicacion').value,
      telefono: document.getElementById('req-tel').value,
      notas: document.getElementById('req-notas').value
    };

    if (!data.nombre || !data.fecha || !data.telefono) {
      mostrarAlerta('Por favor completa tu nombre, fecha y teléfono.');
      return;
    }

    // CANDADO DE SEGURIDAD: Desactivar botón inmediatamente
    var btnSubmit = document.getElementById('btn-submit-req');
    btnSubmit.disabled = true;
    var originalTexto = btnSubmit.innerText;
    btnSubmit.innerText = '⏳ Enviando pedido, aguarde...';

    localStorage.setItem('pasajeroNombre', data.nombre);
    localStorage.setItem('pasajeroTel', data.telefono);

    google.script.run
      .withSuccessHandler(function() {
        // Restablecer botón tras el éxito
        btnSubmit.disabled = false;
        btnSubmit.innerText = originalTexto;

        mostrarAlerta('¡Tu solicitud fue enviada con éxito!');
        document.getElementById('req-fecha').value = '';
        document.getElementById('req-ubicacion').value = '';
        document.getElementById('req-notas').value = '';
        loadBoard();
      })
      .withFailureHandler(function(err) {
        // Restablecer botón si hay un fallo de red
        btnSubmit.disabled = false;
        btnSubmit.innerText = originalTexto;
        mostrarAlerta('Hubo un error de conexión: ' + err.message);
      })
      .submitRequest(data);
  }

  function loadBoard() {
    showView('board-view');
    document.getElementById('loading-board').style.display = 'block';
    document.getElementById('board-container').innerHTML = '';

    google.script.run.withSuccessHandler(function(requests) {
      document.getElementById('loading-board').style.display = 'none';
      rawRequestsData = requests;
      var container = document.getElementById('board-container');

      if (requests.length === 0) {
        container.innerHTML = '<p class="text-muted text-center mt-4">No hay viajes registrados aún.</p>';
        return;
      }

      var dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

      var hoyObj = new Date();
      var hoyStr = hoyObj.getFullYear() + '-' +
                   String(hoyObj.getMonth() + 1).padStart(2, '0') + '-' +
                   String(hoyObj.getDate()).padStart(2, '0');

      for (var i = 0; i < requests.length; i++) {
        var req = requests[i];
        var card = document.createElement('div');

        var esPasado = req.fechaRaw < hoyStr;
        card.className = 'card p-3 card-viaje' + (esPasado ? ' past-trip' : '');

        var parts = req.fechaRaw.split('-');
        var dObj = new Date(parts[0], parts[1]-1, parts[2]);
        var fechaFormateada = dias[dObj.getDay()] + ', ' + parts[2] + '/' + parts[1] + '/' + parts[0];

        var locTexto = req.ubicacion ? req.ubicacion : 'No especificada';
        var locDisplay = locTexto;

        if (locTexto.indexOf('http://') === 0 || locTexto.indexOf('https://') === 0) {
          locDisplay = '<br><a href="' + locTexto + '" target="_blank" class="btn btn-sm btn-outline-info py-1 px-3 mt-1">🗺️ Abrir en Google Maps</a>';
        }

        var html = '<h5>' + req.nombre + '</h5>' +
                   '<p class="mb-1 text-muted"><small>📅 ' + fechaFormateada + ' | 🚘 ' + req.tipo + ' | 👥 ' + req.pasajeros + ' pers.</small></p>' +
                   '<p class="mb-2"><strong>Ubicación:</strong> ' + locDisplay + '</p>';

        if (req.notas) {
          html += '<div class="notas-box"><strong>Notas:</strong> ' + req.notas + '</div>';
        }

        if (req.estado === 'Asignado') {
          html += '<div class="assigned-badge mt-2">✅ Llevado por: ' + req.conductor + '</div>';
        } else {
          html += '<button class="btn btn-sm btn-outline-primary mt-3 claim-btn" data-id="' + req.id + '" data-pasajeros="' + req.pasajeros + '">✋ Yo lo llevo (Aceptar Viaje)</button>';
        }

        if (currentUserRole === 'admin') {
          html += '<div class="mt-2 text-end border-top pt-2 mt-3">';
          html += '<button class="btn btn-sm btn-link text-warning p-0 me-3 edit-admin-btn" data-id="' + req.id + '">✏️ Editar Datos</button>';
          html += '<button class="btn btn-sm btn-link text-danger p-0 delete-admin-btn" data-id="' + req.id + '">🗑️ Cancelar Viaje</button>';
          html += '</div>';
        }

        card.innerHTML = html;
        container.appendChild(card);
      }

      actualizarVisibilidadPasados();

      var btns = document.querySelectorAll('.claim-btn');
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function() {
          abrirFormularioViaje(this.getAttribute('data-id'), this.getAttribute('data-pasajeros'));
        });
      }

      var editBtns = document.querySelectorAll('.edit-admin-btn');
      for (var k = 0; k < editBtns.length; k++) {
        editBtns[k].addEventListener('click', function() { abrirModalEdicionAdmin(this.getAttribute('data-id')); });
      }

      var delBtns = document.querySelectorAll('.delete-admin-btn');
      for (var m = 0; m < delBtns.length; m++) {
        delBtns[m].addEventListener('click', function() { cancelarViajeAdmin(this.getAttribute('data-id')); });
      }
    }).getAllRequests();
  }

  function actualizarVisibilidadPasados() {
    var mostrarPasados = document.getElementById('switch-past-trips').checked;
    var tarjetasPasadas = document.querySelectorAll('.past-trip');
    tarjetasPasadas.forEach(function(card) {
      card.style.display = mostrarPasados ? 'block' : 'none';
    });
  }

  function abrirFormularioViaje(id, pasajerosStr) {
    document.getElementById('claim-id').value = id;
    document.getElementById('drv-nombre').value = localStorage.getItem('conductorNombre') || '';
    document.getElementById('drv-tel').value = localStorage.getItem('conductorTel') || '';
    document.getElementById('drv-notas').value = '';

    // Populate passenger dropdown based on request
    var maxPasajeros = parseInt(pasajerosStr) || 1;
    var isPlus = pasajerosStr && pasajerosStr.includes('+');
    var selectHtml = '';

    // We iterate backwards so the highest number (total requested) is default
    for (var i = maxPasajeros; i >= 1; i--) {
      var label = i + " persona(s)";
      if (i === maxPasajeros && isPlus) {
        label = i + " o más personas (Todo el grupo)";
      } else if (i === maxPasajeros) {
        label = i + " persona(s) (Todo el grupo)";
      }
      selectHtml += '<option value="' + i + '">' + label + '</option>';
    }
    document.getElementById('drv-pasajeros-tomados').innerHTML = selectHtml;

    document.getElementById('driver-form').style.display = 'block';
    window.scrollTo(0, document.body.scrollHeight);
  }

  function cancelarViaje() {
    document.getElementById('driver-form').style.display = 'none';
  }

  function confirmarViaje() {
    var data = {
      id: document.getElementById('claim-id').value,
      conductorNombre: document.getElementById('drv-nombre').value,
      conductorTel: document.getElementById('drv-tel').value,
      pasajerosTomados: document.getElementById('drv-pasajeros-tomados').value,
      notasConductor: document.getElementById('drv-notas').value,
      asignadoPor: currentUserRole
    };

    if (!data.conductorNombre) {
      mostrarAlerta('Por favor, ingresa tu nombre antes de confirmar.');
      return;
    }

    localStorage.setItem('conductorNombre', data.conductorNombre);
    localStorage.setItem('conductorTel', data.conductorTel);
    document.getElementById('driver-form').style.display = 'none';

    google.script.run.withSuccessHandler(function(response) {
      if (response.success) {
        var waLink = 'https://wa.me/' + response.waNumber + '?text=' + encodeURIComponent(response.mensaje);
        window.open(waLink, '_blank');
        loadBoard();
      } else {
        mostrarAlerta("Error: " + response.mensaje);
      }
    }).claimRide(data);
  }

  function cancelarViajeAdmin(id) {
    if (confirm("¿Seguro que deseas cancelar y ocultar este viaje?")) {
      var pin = localStorage.getItem('appAuthPin');
      google.script.run.withSuccessHandler(function() {
        mostrarAlerta("Viaje cancelado exitosamente.");
        loadBoard();
      }).cancelRequest(pin, id);
    }
  }

  function abrirModalEdicionAdmin(id) {
    var req = rawRequestsData.find(function(item) { return item.id.toString() === id.toString(); });
    if (!req) return;

    document.getElementById('edit-id').value = req.id;
    document.getElementById('edit-nombre').value = req.nombre;
    document.getElementById('edit-fecha').value = req.fechaRaw;
    document.getElementById('edit-pasajeros').value = req.pasajeros;
    document.getElementById('edit-tipo').value = req.tipo;
    document.getElementById('edit-ubicacion').value = req.ubicacion;
    document.getElementById('edit-tel').value = req.telefono;
    document.getElementById('edit-estado').value = req.estado;
    document.getElementById('edit-conductor').value = req.conductor;
    document.getElementById('edit-notas').value = req.notas;

    var editModal = new bootstrap.Modal(document.getElementById('editModal'));
    editModal.show();
  }

  function guardarEdicionAdmin() {
    var pin = localStorage.getItem('appAuthPin');
    var data = {
      id: document.getElementById('edit-id').value,
      nombre: document.getElementById('edit-nombre').value,
      fecha: document.getElementById('edit-fecha').value,
      pasajeros: document.getElementById('edit-pasajeros').value,
      tipo: document.getElementById('edit-tipo').value,
      ubicacion: document.getElementById('edit-ubicacion').value,
      telefono: document.getElementById('edit-tel').value,
      estado: document.getElementById('edit-estado').value,
      conductor: document.getElementById('edit-conductor').value,
      notas: document.getElementById('edit-notas').value
    };

    if (!data.nombre || !data.fecha || !data.telefono) {
      alert("Nombre, fecha y teléfono son obligatorios.");
      return;
    }

    var modalEl = document.getElementById('editModal');
    var modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    google.script.run.withSuccessHandler(function() {
      loadBoard();
      mostrarAlerta("La solicitud fue actualizada correctamente.");
    }).updateRequest(pin, data);
  }

  function copiarResumenWhatsApp() {
    var hoyObj = new Date();
    var hoyStr = hoyObj.getFullYear() + '-' +
                 String(hoyObj.getMonth() + 1).padStart(2, '0') + '-' +
                 String(hoyObj.getDate()).padStart(2, '0');

    var pendientes = rawRequestsData.filter(function(r) {
      return r.estado === 'Pendiente' && r.fechaRaw >= hoyStr;
    });

    if (pendientes.length === 0) {
      mostrarAlerta("No hay viajes pendientes futuros en la pizarra para resumir.");
      return;
    }

    var dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    var texto = "🚙 *Nuevos viajes pendientes:*\n";

    for (var i = 0; i < pendientes.length; i++) {
      var r = pendientes[i];
      var parts = r.fechaRaw.split('-');
      var dObj = new Date(parts[0], parts[1]-1, parts[2]);
      var fechaFormateada = dias[dObj.getDay()] + ' ' + parts[2] + '/' + parts[1];

      texto += "• " + r.nombre + " (" + r.tipo + " - " + fechaFormateada + " - " + r.pasajeros + " pers)\n";
    }
    texto += "\n👉 Entren al enlace para aceptarlos.";

    navigator.clipboard.writeText(texto).then(function() {
      mostrarAlerta("¡Resumen copiado al portapapeles! Listo para pegar en el grupo de WhatsApp.");
    }).catch(function() {
      alert("Tu navegador bloqueó el copiado automático. Aquí tienes el texto:\n\n" + texto);
    });
  }
