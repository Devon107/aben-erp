// ---------- Estado ----------

let clientes = [];
let clienteActualId = null;
let proyectosActuales = [];
const cacheRentabilidad = {}; // proyectoId -> data
const cacheGastos = {}; // proyectoId -> array
const cacheEntradas = {}; // proyectoId -> array
const detalleAbierto = new Set(); // proyectoId
let activeTimer = null; // { proyectoId, startTime: ISOString } | null

// ---------- Utilidades ----------

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden', 'error');
  if (isError) toast.classList.add('error');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function money(n) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, , mes, dia] = match;
  return `${dia} ${MESES_CORTOS[Number(mes) - 1]}`;
}

function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function horasYMinutosADecimal(horas, minutos) {
  return Math.round((Number(horas || 0) + Number(minutos || 0) / 60) * 100) / 100;
}

function decimalAHorasYMinutos(decimal) {
  const totalMinutos = Math.round(Number(decimal || 0) * 60);
  return { horas: Math.floor(totalMinutos / 60), minutos: totalMinutos % 60 };
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ---------- Modales ----------

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

document.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', () => closeModal(el.dataset.closeModal));
});

document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach((o) => o.classList.add('hidden'));
  }
});

// Confirmación de borrado en modal (reemplaza confirm() del navegador).
// Devuelve una Promise<boolean> que resuelve true solo si se confirma explícitamente.
function pedirConfirmacion(mensaje) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-confirmar-overlay');
    const btnSi = document.getElementById('btn-confirmar-si');
    const btnNo = document.getElementById('btn-confirmar-no');
    const btnX = document.getElementById('btn-confirmar-cerrar');

    document.getElementById('confirmar-mensaje').textContent = mensaje;
    openModal('modal-confirmar-overlay');

    function terminar(resultado) {
      btnSi.removeEventListener('click', onSi);
      btnNo.removeEventListener('click', onNo);
      btnX.removeEventListener('click', onNo);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKeydown);
      closeModal('modal-confirmar-overlay');
      resolve(resultado);
    }
    function onSi() { terminar(true); }
    function onNo() { terminar(false); }
    function onBackdrop(e) { if (e.target === overlay) terminar(false); }
    function onKeydown(e) { if (e.key === 'Escape') terminar(false); }

    btnSi.addEventListener('click', onSi);
    btnNo.addEventListener('click', onNo);
    btnX.addEventListener('click', onNo);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKeydown);
  });
}

// ---------- Timer (cronómetro) ----------

const TIMER_STORAGE_KEY = 'freelance-tracker:activeTimer';

function cargarTimerGuardado() {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function guardarTimerEnStorage(timer) {
  if (timer) {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  } else {
    localStorage.removeItem(TIMER_STORAGE_KEY);
  }
}

function timerWidgetHtml(proyectoId) {
  if (activeTimer && activeTimer.proyectoId === proyectoId) {
    const elapsed = Date.now() - new Date(activeTimer.startTime).getTime();
    return `
      <span class="timer-display" id="timer-display-${proyectoId}">${formatElapsed(elapsed)}</span>
      <button class="btn btn-secondary btn-sm" data-timer-stop="${proyectoId}">Detener</button>`;
  }
  if (activeTimer) {
    return `
      <span class="timer-display muted">Cronómetro activo en otro proyecto</span>
      <button class="btn btn-primary btn-sm" disabled>Iniciar</button>`;
  }
  return `
    <span class="timer-display muted">00:00:00</span>
    <button class="btn btn-primary btn-sm" data-timer-start="${proyectoId}">Iniciar</button>`;
}

function refrescarWidgetsTimer() {
  proyectosActuales.forEach((p) => {
    const el = document.getElementById(`timer-widget-${p.id}`);
    if (el) el.innerHTML = timerWidgetHtml(p.id);
  });
}

function tickTimerDisplay() {
  if (!activeTimer) return;
  const el = document.getElementById(`timer-display-${activeTimer.proyectoId}`);
  if (el) el.textContent = formatElapsed(Date.now() - new Date(activeTimer.startTime).getTime());
}

setInterval(tickTimerDisplay, 1000);

function iniciarTimer(proyectoId) {
  if (activeTimer) {
    showToast('Ya hay un cronómetro activo en otro proyecto', true);
    return;
  }
  activeTimer = { proyectoId, startTime: new Date().toISOString() };
  guardarTimerEnStorage(activeTimer);
  refrescarWidgetsTimer();
}

async function detenerTimer(proyectoId) {
  if (!activeTimer || activeTimer.proyectoId !== proyectoId) return;

  const inicio = new Date(activeTimer.startTime);
  const ahora = new Date();
  const horas = Math.max(0.01, Math.round(((ahora - inicio) / 3600000) * 100) / 100);

  const descripcion = window.prompt('Descripción breve de la tarea realizada:', '');
  if (descripcion === null) return; // el usuario canceló: el cronómetro sigue corriendo

  try {
    await api('/api/entradas-tiempo', {
      method: 'POST',
      body: JSON.stringify({
        proyecto_id: proyectoId,
        fecha: isoDateLocal(inicio),
        horas,
        descripcion: descripcion.trim() || 'Sesión de trabajo',
        origen: 'timer',
      }),
    });
    activeTimer = null;
    guardarTimerEnStorage(null);
    refrescarWidgetsTimer();
    showToast(`Tiempo registrado: ${horas} h`);
    await cargarEntradas(proyectoId);
    await cargarRentabilidad(proyectoId);
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Navegación ----------

function ocultarTodasLasVistas() {
  document.getElementById('view-dashboard').classList.remove('active');
  document.getElementById('view-clientes').classList.remove('active');
  document.getElementById('view-cliente').classList.remove('active');
  document.getElementById('crumb-dashboard').classList.remove('active');
  document.getElementById('crumb-clientes').classList.remove('active');
  document.getElementById('crumb-cliente-wrap').classList.add('hidden');
}

function irAVistaDashboard() {
  clienteActualId = null;
  ocultarTodasLasVistas();
  document.getElementById('view-dashboard').classList.add('active');
  document.getElementById('crumb-dashboard').classList.add('active');
  cargarDashboard();
}

function irAVistaClientes() {
  clienteActualId = null;
  ocultarTodasLasVistas();
  document.getElementById('view-clientes').classList.add('active');
  document.getElementById('crumb-clientes').classList.add('active');
}

document.getElementById('crumb-dashboard').addEventListener('click', irAVistaDashboard);
document.getElementById('crumb-clientes').addEventListener('click', irAVistaClientes);
document.getElementById('btn-volver').addEventListener('click', irAVistaClientes);

async function irAVistaCliente(id) {
  clienteActualId = id;
  const cliente = clientes.find((c) => c.id === id);
  if (!cliente) return;

  ocultarTodasLasVistas();
  document.getElementById('view-cliente').classList.add('active');
  document.getElementById('crumb-clientes').classList.add('active');

  document.getElementById('cliente-detalle-nombre').textContent = cliente.nombre;
  document.getElementById('cliente-detalle-modo').textContent = cliente.modo_facturacion;
  document.getElementById('crumb-cliente-nombre').textContent = cliente.nombre;
  document.getElementById('crumb-cliente-wrap').classList.remove('hidden');

  detalleAbierto.clear();
  await cargarProyectosDeCliente(id);
}

// ---------- Dashboard ----------

function calcularRangoPreset(preset) {
  const hoy = new Date();
  if (preset === 'mes-actual') {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return { desde: isoDateLocal(desde), hasta: isoDateLocal(hasta) };
  }
  if (preset === 'mes-pasado') {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    return { desde: isoDateLocal(desde), hasta: isoDateLocal(hasta) };
  }
  if (preset === 'anio-actual') {
    const desde = new Date(hoy.getFullYear(), 0, 1);
    const hasta = new Date(hoy.getFullYear(), 11, 31);
    return { desde: isoDateLocal(desde), hasta: isoDateLocal(hasta) };
  }
  return null; // 'personalizado' se resuelve leyendo los inputs de fecha
}

function rangoActual() {
  const preset = document.getElementById('dashboard-rango').value;
  if (preset === 'personalizado') {
    const desde = document.getElementById('dashboard-desde').value;
    const hasta = document.getElementById('dashboard-hasta').value;
    return desde && hasta ? { desde, hasta } : null;
  }
  return calcularRangoPreset(preset);
}

function actualizarVisibilidadInputsPersonalizados() {
  const esPersonalizado = document.getElementById('dashboard-rango').value === 'personalizado';
  document.getElementById('dashboard-desde').classList.toggle('hidden', !esPersonalizado);
  document.getElementById('dashboard-hasta').classList.toggle('hidden', !esPersonalizado);
  document.getElementById('dashboard-rango-sep').classList.toggle('hidden', !esPersonalizado);
}

document.getElementById('dashboard-rango').addEventListener('change', () => {
  actualizarVisibilidadInputsPersonalizados();
  const rango = rangoActual();
  if (rango) cargarDashboard();
});
document.getElementById('dashboard-desde').addEventListener('change', () => {
  if (rangoActual()) cargarDashboard();
});
document.getElementById('dashboard-hasta').addEventListener('change', () => {
  if (rangoActual()) cargarDashboard();
});

function calcularAlertas(clientesData) {
  const conHoras = clientesData.filter((c) => c.total_horas > 0);
  let promedioHoras = 0;
  let promedioMargenPorHora = 0;
  if (conHoras.length > 0) {
    promedioHoras = conHoras.reduce((s, c) => s + c.total_horas, 0) / conHoras.length;
    promedioMargenPorHora =
      conHoras.reduce((s, c) => s + c.margen / c.total_horas, 0) / conHoras.length;
  }

  return clientesData.map((c) => {
    const margenPorHora = c.total_horas > 0 ? c.margen / c.total_horas : null;
    let alerta = null;
    if (c.margen < 0) {
      alerta = 'perdida';
    } else if (
      c.total_horas > 0 &&
      c.total_horas >= promedioHoras &&
      margenPorHora < promedioMargenPorHora
    ) {
      alerta = 'bajo-rendimiento';
    }
    return { ...c, alerta, margen_por_hora: margenPorHora };
  });
}

function alertaBadgeHtml(alerta) {
  if (alerta === 'perdida') {
    return '<span class="badge-alerta perdida" title="Este cliente genera pérdida en el período seleccionado">&#9888; Pérdida</span>';
  }
  if (alerta === 'bajo-rendimiento') {
    return '<span class="badge-alerta bajo" title="Muchas horas invertidas con un margen por hora por debajo del promedio de tus clientes en este período">&#9888; Bajo rendimiento</span>';
  }
  return '<span class="text-faint">—</span>';
}

async function cargarDashboard() {
  const rango = rangoActual();
  if (!rango) return;

  const label = document.getElementById('dashboard-rango-label');
  label.textContent = `Del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)}`;

  try {
    const data = await api(`/api/dashboard?desde=${rango.desde}&hasta=${rango.hasta}`);
    renderDashboard(calcularAlertas(data.clientes));
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderDashboard(clientesData) {
  const tbody = document.getElementById('tabla-dashboard-body');
  const empty = document.getElementById('dashboard-empty');

  if (clientesData.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = clientesData
    .map((c) => {
      const filaClase = c.alerta === 'perdida' ? 'fila-perdida' : c.alerta === 'bajo-rendimiento' ? 'fila-bajo-rendimiento' : '';
      const margenClase = c.margen >= 0 ? 'valor-positivo' : 'valor-negativo';
      return `
        <tr class="${filaClase}">
          <td><button class="link-cliente" data-ir-cliente="${c.cliente_id}">${escapeHtml(c.cliente_nombre)}</button></td>
          <td>${c.total_horas} h</td>
          <td>${money(c.ingreso_total)}</td>
          <td class="${margenClase}">${money(c.margen)}</td>
          <td>${alertaBadgeHtml(c.alerta)}</td>
        </tr>`;
    })
    .join('');
}

document.getElementById('tabla-dashboard-body').addEventListener('click', (e) => {
  const clienteId = e.target.closest('[data-ir-cliente]')?.dataset.irCliente;
  if (clienteId) irAVistaCliente(Number(clienteId));
});

// ---------- Clientes ----------

async function cargarClientes() {
  clientes = await api('/api/clientes');
  renderClientes();
}

function renderClientes() {
  const grid = document.getElementById('grid-clientes');
  const empty = document.getElementById('clientes-empty');
  if (clientes.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = clientes
    .map(
      (c) => `
      <div class="cliente-card" data-id="${c.id}">
        <div class="cliente-card-top">
          <h3>${escapeHtml(c.nombre)}</h3>
          <div class="cliente-card-actions">
            <button class="btn-icon" data-edit-cliente="${c.id}" title="Editar">&#9998;</button>
            <button class="btn-icon danger" data-del-cliente="${c.id}" title="Eliminar">&times;</button>
          </div>
        </div>
        <span class="badge badge-modo">${c.modo_facturacion}</span>
      </div>`
    )
    .join('');
}

document.getElementById('grid-clientes').addEventListener('click', (e) => {
  const editId = e.target.closest('[data-edit-cliente]')?.dataset.editCliente;
  const delId = e.target.closest('[data-del-cliente]')?.dataset.delCliente;
  const card = e.target.closest('.cliente-card');

  if (editId) {
    e.stopPropagation();
    const cliente = clientes.find((c) => c.id === Number(editId));
    abrirModalCliente(cliente);
    return;
  }
  if (delId) {
    e.stopPropagation();
    eliminarCliente(Number(delId));
    return;
  }
  if (card) {
    irAVistaCliente(Number(card.dataset.id));
  }
});

function abrirModalCliente(cliente) {
  const form = document.getElementById('form-cliente');
  form.reset();
  form.id.value = cliente?.id || '';
  form.nombre.value = cliente?.nombre || '';
  form.modo_facturacion.value = cliente?.modo_facturacion || 'hora';
  document.getElementById('modal-cliente-title').textContent = cliente ? 'Editar cliente' : 'Nuevo cliente';
  openModal('modal-cliente-overlay');
}

document.getElementById('btn-nuevo-cliente').addEventListener('click', () => abrirModalCliente(null));
document.getElementById('btn-editar-cliente').addEventListener('click', () => {
  const cliente = clientes.find((c) => c.id === clienteActualId);
  abrirModalCliente(cliente);
});

document.getElementById('form-cliente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  const payload = {
    nombre: form.nombre.value,
    modo_facturacion: form.modo_facturacion.value,
  };
  try {
    if (id) {
      await api(`/api/clientes/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Cliente actualizado');
    } else {
      await api('/api/clientes', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Cliente creado');
    }
    closeModal('modal-cliente-overlay');
    await cargarClientes();
    if (clienteActualId && String(clienteActualId) === id) {
      await irAVistaCliente(clienteActualId);
    }
  } catch (err) {
    showToast(err.message, true);
  }
});

async function eliminarCliente(id) {
  if (!(await pedirConfirmacion('¿Eliminar este cliente? Se eliminarán también sus proyectos, horas y gastos asociados.'))) return;
  try {
    await api(`/api/clientes/${id}`, { method: 'DELETE' });
    showToast('Cliente eliminado');
    await cargarClientes();
    if (clienteActualId === id) irAVistaClientes();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Proyectos ----------

async function cargarProyectosDeCliente(clienteId) {
  proyectosActuales = await api(`/api/proyectos?cliente_id=${clienteId}`);
  renderProyectos();
  proyectosActuales.forEach((p) => cargarRentabilidad(p.id));
}

function renderProyectos() {
  const grid = document.getElementById('grid-proyectos');
  const empty = document.getElementById('proyectos-empty');
  if (proyectosActuales.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = proyectosActuales.map((p) => renderProyectoCard(p)).join('');
}

function renderProyectoCard(p) {
  const abierto = detalleAbierto.has(p.id);
  const tarifaTexto = p.tipo_cobro === 'hora' ? `${money(p.tarifa_hora)} / hora` : `${money(p.precio_fijo)} fijo`;
  return `
    <div class="proyecto-card ${abierto ? 'abierto' : ''}" data-proyecto-id="${p.id}">
      <div class="proyecto-card-top">
        <div>
          <h3>${escapeHtml(p.nombre)}</h3>
          <div class="proyecto-meta">${tarifaTexto}</div>
        </div>
        <div class="proyecto-card-actions">
          <span class="badge badge-${p.estado}">${p.estado}</span>
          <button class="btn-icon" data-edit-proyecto="${p.id}" title="Editar">&#9998;</button>
          <button class="btn-icon danger" data-del-proyecto="${p.id}" title="Eliminar">&times;</button>
        </div>
      </div>

      <div class="rent-mini" id="rent-mini-${p.id}">
        ${rentMiniHtml(cacheRentabilidad[p.id])}
      </div>

      <div class="proyecto-footer">
        <button class="btn btn-secondary btn-sm" data-toggle-detalle="${p.id}">
          ${abierto ? 'Ocultar detalle' : 'Ver detalle y gastos'}
        </button>
      </div>

      <div class="proyecto-detalle ${abierto ? '' : 'hidden'}" id="detalle-${p.id}">
        <div class="detalle-col">
          <h4>Registro de tiempo</h4>

          <div class="timer-widget" id="timer-widget-${p.id}">
            ${timerWidgetHtml(p.id)}
          </div>

          <form class="subform form-tiempo" data-proyecto-id="${p.id}">
            <input type="date" name="fecha" required />
            <input type="number" class="input-horas" name="horas" placeholder="h" min="0" step="1" required />
            <input type="number" class="input-minutos" name="minutos" placeholder="min" min="0" max="59" step="1" required />
            <input type="text" name="descripcion" placeholder="Descripción" />
            <button type="submit" class="btn btn-primary btn-sm">Agregar</button>
          </form>

          <div class="tabla-wrap">
            <table class="tabla-entradas">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Horas</th>
                  <th>Descripción</th>
                  <th>Origen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="lista-tiempo-${p.id}">
                <tr><td colspan="5" class="mini-empty">Cargando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="detalle-col">
          <h4>Gastos</h4>
          <form class="subform form-gasto" data-proyecto-id="${p.id}">
            <input type="date" name="fecha" value="${isoDateLocal(new Date())}" required />
            <input type="text" name="descripcion" placeholder="Descripción" required />
            <input type="number" step="0.01" min="0" name="monto" placeholder="Monto" required />
            <button type="submit" class="btn btn-primary btn-sm">Agregar</button>
          </form>
          <ul class="mini-list" id="lista-gastos-${p.id}">
            <li class="mini-empty">Cargando...</li>
          </ul>
        </div>
      </div>
    </div>`;
}

function rentMiniHtml(data) {
  if (!data) {
    return `
      <div class="rent-mini-item"><span class="label">Horas</span><span class="value">&hellip;</span></div>
      <div class="rent-mini-item"><span class="label">Ingreso</span><span class="value">&hellip;</span></div>
      <div class="rent-mini-item"><span class="label">Gastos</span><span class="value">&hellip;</span></div>
      <div class="rent-mini-item margen"><span class="label">Margen</span><span class="value">&hellip;</span></div>`;
  }
  const margenClass = data.margen >= 0 ? 'positivo' : 'negativo';
  return `
    <div class="rent-mini-item"><span class="label">Horas</span><span class="value">${data.total_horas} h</span></div>
    <div class="rent-mini-item"><span class="label">Ingreso</span><span class="value">${money(data.ingreso_total)}</span></div>
    <div class="rent-mini-item"><span class="label">Gastos</span><span class="value">${money(data.total_gastos)}</span></div>
    <div class="rent-mini-item margen"><span class="label">Margen</span><span class="value ${margenClass}">${money(data.margen)}</span></div>`;
}

async function cargarRentabilidad(proyectoId) {
  try {
    const data = await api(`/api/proyectos/${proyectoId}/rentabilidad`);
    cacheRentabilidad[proyectoId] = data;
    const el = document.getElementById(`rent-mini-${proyectoId}`);
    if (el) el.innerHTML = rentMiniHtml(data);
  } catch (err) {
    // el proyecto pudo haber sido eliminado mientras cargaba; se ignora
  }
}

function abrirModalProyecto(proyecto) {
  const form = document.getElementById('form-proyecto');
  form.reset();
  form.id.value = proyecto?.id || '';
  form.cliente_id.value = clienteActualId;
  form.nombre.value = proyecto?.nombre || '';
  form.tipo_cobro.value = proyecto?.tipo_cobro || 'hora';
  form.tarifa_hora.value = proyecto?.tarifa_hora ?? '';
  form.precio_fijo.value = proyecto?.precio_fijo ?? '';
  form.estado.value = proyecto?.estado || 'activo';
  actualizarCamposTipoCobro();
  document.getElementById('modal-proyecto-title').textContent = proyecto ? 'Editar proyecto' : 'Nuevo proyecto';
  openModal('modal-proyecto-overlay');
}

function actualizarCamposTipoCobro() {
  const tipo = document.getElementById('proyecto-tipo-cobro').value;
  document.getElementById('campo-tarifa-hora').classList.toggle('hidden', tipo !== 'hora');
  document.getElementById('campo-precio-fijo').classList.toggle('hidden', tipo !== 'fijo');
}

document.getElementById('proyecto-tipo-cobro').addEventListener('change', actualizarCamposTipoCobro);
document.getElementById('btn-nuevo-proyecto').addEventListener('click', () => abrirModalProyecto(null));

document.getElementById('form-proyecto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  const payload = {
    cliente_id: Number(form.cliente_id.value),
    nombre: form.nombre.value,
    tipo_cobro: form.tipo_cobro.value,
    tarifa_hora: form.tarifa_hora.value ? Number(form.tarifa_hora.value) : null,
    precio_fijo: form.precio_fijo.value ? Number(form.precio_fijo.value) : null,
    estado: form.estado.value,
  };
  try {
    if (id) {
      await api(`/api/proyectos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Proyecto actualizado');
    } else {
      await api('/api/proyectos', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Proyecto creado');
    }
    closeModal('modal-proyecto-overlay');
    await cargarProyectosDeCliente(clienteActualId);
  } catch (err) {
    showToast(err.message, true);
  }
});

async function eliminarProyecto(id) {
  if (!(await pedirConfirmacion('¿Eliminar este proyecto? Se eliminarán también sus horas y gastos asociados.'))) return;
  try {
    await api(`/api/proyectos/${id}`, { method: 'DELETE' });
    showToast('Proyecto eliminado');
    delete cacheRentabilidad[id];
    delete cacheGastos[id];
    delete cacheEntradas[id];
    detalleAbierto.delete(id);
    if (activeTimer && activeTimer.proyectoId === id) {
      activeTimer = null;
      guardarTimerEnStorage(null);
    }
    await cargarProyectosDeCliente(clienteActualId);
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Delegación de eventos en grid de proyectos ----------

document.getElementById('grid-proyectos').addEventListener('click', (e) => {
  const editId = e.target.closest('[data-edit-proyecto]')?.dataset.editProyecto;
  const delId = e.target.closest('[data-del-proyecto]')?.dataset.delProyecto;
  const toggleId = e.target.closest('[data-toggle-detalle]')?.dataset.toggleDetalle;
  const delGastoId = e.target.closest('[data-del-gasto]')?.dataset.delGasto;
  const delTiempoId = e.target.closest('[data-del-tiempo]')?.dataset.delTiempo;
  const editTiempoId = e.target.closest('[data-edit-tiempo]')?.dataset.editTiempo;
  const timerStartId = e.target.closest('[data-timer-start]')?.dataset.timerStart;
  const timerStopId = e.target.closest('[data-timer-stop]')?.dataset.timerStop;

  if (editId) {
    const proyecto = proyectosActuales.find((p) => p.id === Number(editId));
    abrirModalProyecto(proyecto);
  } else if (delId) {
    eliminarProyecto(Number(delId));
  } else if (toggleId) {
    toggleDetalleProyecto(Number(toggleId));
  } else if (delGastoId) {
    eliminarGasto(Number(delGastoId));
  } else if (delTiempoId) {
    eliminarTiempo(Number(delTiempoId));
  } else if (editTiempoId) {
    editarTiempo(Number(editTiempoId));
  } else if (timerStartId) {
    iniciarTimer(Number(timerStartId));
  } else if (timerStopId) {
    detenerTimer(Number(timerStopId));
  }
});

document.getElementById('grid-proyectos').addEventListener('submit', async (e) => {
  if (e.target.classList.contains('form-tiempo')) {
    e.preventDefault();
    await agregarTiempo(e.target);
  } else if (e.target.classList.contains('form-gasto')) {
    e.preventDefault();
    await agregarGasto(e.target);
  }
});

async function toggleDetalleProyecto(proyectoId) {
  const card = document.querySelector(`.proyecto-card[data-proyecto-id="${proyectoId}"]`);
  const detalle = document.getElementById(`detalle-${proyectoId}`);
  const btn = card.querySelector('[data-toggle-detalle]');

  if (detalleAbierto.has(proyectoId)) {
    detalleAbierto.delete(proyectoId);
    card.classList.remove('abierto');
    detalle.classList.add('hidden');
    btn.textContent = 'Ver detalle y gastos';
    return;
  }

  detalleAbierto.add(proyectoId);
  card.classList.add('abierto');
  detalle.classList.remove('hidden');
  btn.textContent = 'Ocultar detalle';

  await Promise.all([cargarGastos(proyectoId), cargarEntradas(proyectoId)]);
}

// ---------- Entradas de tiempo (dentro del detalle) ----------

async function cargarEntradas(proyectoId) {
  const entradas = await api(`/api/entradas-tiempo?proyecto_id=${proyectoId}`);
  cacheEntradas[proyectoId] = entradas;
  renderEntradas(proyectoId);
}

function renderEntradas(proyectoId) {
  const tbody = document.getElementById(`lista-tiempo-${proyectoId}`);
  if (!tbody) return;
  const entradas = cacheEntradas[proyectoId] || [];
  if (entradas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="mini-empty">Sin horas registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = entradas
    .map(
      (t) => `
      <tr>
        <td>${fechaCorta(t.fecha)}</td>
        <td>${t.horas} h</td>
        <td class="col-descripcion">${escapeHtml(t.descripcion || '—')}</td>
        <td><span class="badge-origen badge-origen-${t.origen}">${t.origen}</span></td>
        <td>
          <div class="row-actions-table">
            <button class="btn-icon" data-edit-tiempo="${t.id}" title="Editar">&#9998;</button>
            <button class="btn-icon danger" data-del-tiempo="${t.id}" title="Eliminar">&times;</button>
          </div>
        </td>
      </tr>`
    )
    .join('');
}

function buscarProyectoDeEntrada(id) {
  const pid = Object.keys(cacheEntradas).find((key) => cacheEntradas[key].some((t) => t.id === id));
  return pid ? Number(pid) : null;
}

// Agregar es siempre una entrada nueva: este formulario inline no comparte
// estado con la edición (que vive en su propio modal, ver más abajo). Así se
// evita el bug donde, al quedar el formulario "enganchado" en modo edición de
// otra entrada, un alta terminaba sobrescribiendo esa entrada en vez de crear una nueva.
async function agregarTiempo(form) {
  const proyectoId = Number(form.dataset.proyectoId);
  const horas = horasYMinutosADecimal(form.horas.value, form.minutos.value);
  if (horas <= 0) {
    showToast('Ingresá al menos 1 minuto', true);
    return;
  }
  const payload = {
    proyecto_id: proyectoId,
    fecha: form.fecha.value,
    horas,
    descripcion: form.descripcion.value,
    origen: 'manual',
  };
  try {
    await api('/api/entradas-tiempo', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    showToast('Horas registradas');
    await cargarEntradas(proyectoId);
    await cargarRentabilidad(proyectoId);
  } catch (err) {
    showToast(err.message, true);
  }
}

function editarTiempo(id) {
  const proyectoId = buscarProyectoDeEntrada(id);
  if (proyectoId === null) return;
  const entrada = cacheEntradas[proyectoId].find((t) => t.id === id);
  if (!entrada) return;

  const { horas, minutos } = decimalAHorasYMinutos(entrada.horas);
  const form = document.getElementById('form-editar-tiempo');
  form.id.value = entrada.id;
  form.proyecto_id.value = proyectoId;
  form.origen.value = entrada.origen;
  form.fecha.value = entrada.fecha;
  form.horas.value = horas;
  form.minutos.value = minutos;
  form.descripcion.value = entrada.descripcion || '';
  openModal('modal-tiempo-overlay');
}

document.getElementById('form-editar-tiempo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const proyectoId = Number(form.proyecto_id.value);
  const horas = horasYMinutosADecimal(form.horas.value, form.minutos.value);
  if (horas <= 0) {
    showToast('Ingresá al menos 1 minuto', true);
    return;
  }
  const payload = {
    proyecto_id: proyectoId,
    fecha: form.fecha.value,
    horas,
    descripcion: form.descripcion.value,
    origen: form.origen.value,
  };
  try {
    await api(`/api/entradas-tiempo/${form.id.value}`, { method: 'PUT', body: JSON.stringify(payload) });
    showToast('Entrada actualizada');
    closeModal('modal-tiempo-overlay');
    await cargarEntradas(proyectoId);
    await cargarRentabilidad(proyectoId);
  } catch (err) {
    showToast(err.message, true);
  }
});

async function eliminarTiempo(id) {
  if (!(await pedirConfirmacion('¿Eliminar esta entrada de tiempo?'))) return;
  const proyectoId = buscarProyectoDeEntrada(id);
  try {
    await api(`/api/entradas-tiempo/${id}`, { method: 'DELETE' });
    showToast('Entrada eliminada');
    if (proyectoId !== null) {
      await cargarEntradas(proyectoId);
      await cargarRentabilidad(proyectoId);
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Gastos (dentro del detalle) ----------

async function cargarGastos(proyectoId) {
  const gastos = await api(`/api/gastos?proyecto_id=${proyectoId}`);
  cacheGastos[proyectoId] = gastos;
  renderGastos(proyectoId);
}

function renderGastos(proyectoId) {
  const lista = document.getElementById(`lista-gastos-${proyectoId}`);
  if (!lista) return;
  const gastos = cacheGastos[proyectoId] || [];
  if (gastos.length === 0) {
    lista.innerHTML = '<li class="mini-empty">Sin gastos registrados.</li>';
    return;
  }
  lista.innerHTML = gastos
    .map(
      (g) => `
      <li>
        <div class="item-main">
          <span class="item-title">${escapeHtml(g.descripcion)}</span>
          <span class="item-sub">${fechaCorta(g.fecha)}</span>
        </div>
        <span class="item-value">${money(g.monto)}</span>
        <button class="btn-icon danger" data-del-gasto="${g.id}" title="Eliminar">&times;</button>
      </li>`
    )
    .join('');
}

async function agregarGasto(form) {
  const proyectoId = Number(form.dataset.proyectoId);
  const payload = {
    proyecto_id: proyectoId,
    fecha: form.fecha.value,
    descripcion: form.descripcion.value,
    monto: Number(form.monto.value),
  };
  try {
    await api('/api/gastos', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    showToast('Gasto agregado');
    await cargarGastos(proyectoId);
    await cargarRentabilidad(proyectoId);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function eliminarGasto(id) {
  if (!(await pedirConfirmacion('¿Eliminar este gasto?'))) return;
  const proyectoId = Object.keys(cacheGastos).find((pid) => cacheGastos[pid].some((g) => g.id === id));
  try {
    await api(`/api/gastos/${id}`, { method: 'DELETE' });
    showToast('Gasto eliminado');
    if (proyectoId) {
      await cargarGastos(Number(proyectoId));
      await cargarRentabilidad(Number(proyectoId));
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Init ----------

activeTimer = cargarTimerGuardado();
cargarClientes().catch((err) => showToast(err.message, true));
cargarDashboard();
