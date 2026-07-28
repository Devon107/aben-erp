const state = {
  clientes: [],
  proyectos: [],
  entradas: [],
  gastos: [],
};

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

function resetForm(form) {
  form.reset();
  form.querySelector('input[name="id"]').value = '';
}

// ---------- Tabs ----------

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ---------- Clientes ----------

async function cargarClientes() {
  state.clientes = await api('/api/clientes');
  renderClientes();
  poblarSelectClientes();
}

function renderClientes() {
  const tbody = document.querySelector('#tabla-clientes tbody');
  tbody.innerHTML = state.clientes
    .map(
      (c) => `
      <tr>
        <td>${c.id}</td>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${c.modo_facturacion}</td>
        <td class="row-actions">
          <button class="btn-icon" data-edit-cliente="${c.id}">Editar</button>
          <button class="btn-icon danger" data-del-cliente="${c.id}">Borrar</button>
        </td>
      </tr>`
    )
    .join('');
}

function poblarSelectClientes() {
  const opts = state.clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  document.querySelector('#form-proyecto select[name="cliente_id"]').innerHTML = opts;
}

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
    resetForm(form);
    await cargarClientes();
    await cargarProyectos();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.querySelector('#tabla-clientes tbody').addEventListener('click', async (e) => {
  const editId = e.target.dataset.editCliente;
  const delId = e.target.dataset.delCliente;
  if (editId) {
    const c = state.clientes.find((x) => x.id === Number(editId));
    const form = document.getElementById('form-cliente');
    form.id.value = c.id;
    form.nombre.value = c.nombre;
    form.modo_facturacion.value = c.modo_facturacion;
  }
  if (delId) {
    if (!confirm('¿Borrar este cliente? Esto también borrará sus proyectos asociados.')) return;
    try {
      await api(`/api/clientes/${delId}`, { method: 'DELETE' });
      showToast('Cliente eliminado');
      await cargarClientes();
      await cargarProyectos();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

// ---------- Proyectos ----------

async function cargarProyectos() {
  state.proyectos = await api('/api/proyectos');
  renderProyectos();
  poblarSelectProyectos();
}

function nombreCliente(id) {
  const c = state.clientes.find((x) => x.id === id);
  return c ? c.nombre : `#${id}`;
}

function renderProyectos() {
  const tbody = document.querySelector('#tabla-proyectos tbody');
  tbody.innerHTML = state.proyectos
    .map((p) => {
      const tarifa = p.tipo_cobro === 'hora' ? money(p.tarifa_hora) + '/h' : money(p.precio_fijo);
      return `
      <tr>
        <td>${p.id}</td>
        <td>${escapeHtml(nombreCliente(p.cliente_id))}</td>
        <td>${escapeHtml(p.nombre)}</td>
        <td>${p.tipo_cobro}</td>
        <td>${tarifa}</td>
        <td><span class="badge ${p.estado}">${p.estado}</span></td>
        <td class="row-actions">
          <button class="btn-icon" data-edit-proyecto="${p.id}">Editar</button>
          <button class="btn-icon danger" data-del-proyecto="${p.id}">Borrar</button>
        </td>
      </tr>`;
    })
    .join('');
}

function poblarSelectProyectos() {
  const opts = state.proyectos
    .map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)} (${escapeHtml(nombreCliente(p.cliente_id))})</option>`)
    .join('');
  document.querySelector('#form-tiempo select[name="proyecto_id"]').innerHTML = opts;
  document.querySelector('#form-gasto select[name="proyecto_id"]').innerHTML = opts;
  document.getElementById('select-rentabilidad-proyecto').innerHTML = opts;
}

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
    resetForm(form);
    await cargarProyectos();
    await cargarEntradas();
    await cargarGastos();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.querySelector('#tabla-proyectos tbody').addEventListener('click', async (e) => {
  const editId = e.target.dataset.editProyecto;
  const delId = e.target.dataset.delProyecto;
  if (editId) {
    const p = state.proyectos.find((x) => x.id === Number(editId));
    const form = document.getElementById('form-proyecto');
    form.id.value = p.id;
    form.cliente_id.value = p.cliente_id;
    form.nombre.value = p.nombre;
    form.tipo_cobro.value = p.tipo_cobro;
    form.tarifa_hora.value = p.tarifa_hora ?? '';
    form.precio_fijo.value = p.precio_fijo ?? '';
    form.estado.value = p.estado;
  }
  if (delId) {
    if (!confirm('¿Borrar este proyecto? Esto también borrará sus horas y gastos asociados.')) return;
    try {
      await api(`/api/proyectos/${delId}`, { method: 'DELETE' });
      showToast('Proyecto eliminado');
      await cargarProyectos();
      await cargarEntradas();
      await cargarGastos();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

// ---------- Entradas de tiempo ----------

async function cargarEntradas() {
  state.entradas = await api('/api/entradas-tiempo');
  renderEntradas();
}

function nombreProyecto(id) {
  const p = state.proyectos.find((x) => x.id === id);
  return p ? p.nombre : `#${id}`;
}

function renderEntradas() {
  const tbody = document.querySelector('#tabla-tiempo tbody');
  tbody.innerHTML = state.entradas
    .map(
      (t) => `
      <tr>
        <td>${t.id}</td>
        <td>${escapeHtml(nombreProyecto(t.proyecto_id))}</td>
        <td>${t.fecha}</td>
        <td>${t.horas}</td>
        <td>${escapeHtml(t.descripcion || '')}</td>
        <td>${t.origen}</td>
        <td class="row-actions">
          <button class="btn-icon" data-edit-tiempo="${t.id}">Editar</button>
          <button class="btn-icon danger" data-del-tiempo="${t.id}">Borrar</button>
        </td>
      </tr>`
    )
    .join('');
}

document.getElementById('form-tiempo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  const payload = {
    proyecto_id: Number(form.proyecto_id.value),
    fecha: form.fecha.value,
    horas: Number(form.horas.value),
    descripcion: form.descripcion.value,
    origen: form.origen.value,
  };
  try {
    if (id) {
      await api(`/api/entradas-tiempo/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Entrada actualizada');
    } else {
      await api('/api/entradas-tiempo', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Entrada creada');
    }
    resetForm(form);
    await cargarEntradas();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.querySelector('#tabla-tiempo tbody').addEventListener('click', async (e) => {
  const editId = e.target.dataset.editTiempo;
  const delId = e.target.dataset.delTiempo;
  if (editId) {
    const t = state.entradas.find((x) => x.id === Number(editId));
    const form = document.getElementById('form-tiempo');
    form.id.value = t.id;
    form.proyecto_id.value = t.proyecto_id;
    form.fecha.value = t.fecha;
    form.horas.value = t.horas;
    form.descripcion.value = t.descripcion || '';
    form.origen.value = t.origen;
  }
  if (delId) {
    if (!confirm('¿Borrar esta entrada de tiempo?')) return;
    try {
      await api(`/api/entradas-tiempo/${delId}`, { method: 'DELETE' });
      showToast('Entrada eliminada');
      await cargarEntradas();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

// ---------- Gastos ----------

async function cargarGastos() {
  state.gastos = await api('/api/gastos');
  renderGastos();
}

function renderGastos() {
  const tbody = document.querySelector('#tabla-gastos tbody');
  tbody.innerHTML = state.gastos
    .map(
      (g) => `
      <tr>
        <td>${g.id}</td>
        <td>${escapeHtml(nombreProyecto(g.proyecto_id))}</td>
        <td>${escapeHtml(g.descripcion)}</td>
        <td>${money(g.monto)}</td>
        <td class="row-actions">
          <button class="btn-icon" data-edit-gasto="${g.id}">Editar</button>
          <button class="btn-icon danger" data-del-gasto="${g.id}">Borrar</button>
        </td>
      </tr>`
    )
    .join('');
}

document.getElementById('form-gasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  const payload = {
    proyecto_id: Number(form.proyecto_id.value),
    descripcion: form.descripcion.value,
    monto: Number(form.monto.value),
  };
  try {
    if (id) {
      await api(`/api/gastos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Gasto actualizado');
    } else {
      await api('/api/gastos', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Gasto creado');
    }
    resetForm(form);
    await cargarGastos();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.querySelector('#tabla-gastos tbody').addEventListener('click', async (e) => {
  const editId = e.target.dataset.editGasto;
  const delId = e.target.dataset.delGasto;
  if (editId) {
    const g = state.gastos.find((x) => x.id === Number(editId));
    const form = document.getElementById('form-gasto');
    form.id.value = g.id;
    form.proyecto_id.value = g.proyecto_id;
    form.descripcion.value = g.descripcion;
    form.monto.value = g.monto;
  }
  if (delId) {
    if (!confirm('¿Borrar este gasto?')) return;
    try {
      await api(`/api/gastos/${delId}`, { method: 'DELETE' });
      showToast('Gasto eliminado');
      await cargarGastos();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

// ---------- Rentabilidad ----------

document.getElementById('btn-ver-rentabilidad').addEventListener('click', async () => {
  const select = document.getElementById('select-rentabilidad-proyecto');
  const proyectoId = select.value;
  if (!proyectoId) {
    showToast('No hay proyectos disponibles', true);
    return;
  }
  try {
    const data = await api(`/api/proyectos/${proyectoId}/rentabilidad`);
    document.getElementById('rent-nombre').textContent = data.nombre;
    document.getElementById('rent-horas').textContent = `${data.total_horas} h`;
    document.getElementById('rent-ingreso').textContent = money(data.ingreso_total);
    document.getElementById('rent-gastos').textContent = money(data.total_gastos);
    document.getElementById('rent-margen').textContent = money(data.margen);
    document.getElementById('rentabilidad-resultado').classList.remove('hidden');
  } catch (err) {
    showToast(err.message, true);
  }
});

// ---------- Cancelar edición ----------

document.querySelectorAll('[data-cancel]').forEach((btn) => {
  btn.addEventListener('click', () => {
    resetForm(document.getElementById(btn.dataset.cancel));
  });
});

// ---------- Helpers ----------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- Init ----------

async function init() {
  await cargarClientes();
  await cargarProyectos();
  await cargarEntradas();
  await cargarGastos();
}

init().catch((err) => showToast(err.message, true));
