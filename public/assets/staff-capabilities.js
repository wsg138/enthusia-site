async function session(path) {
  try {
    const response = await fetch(path, {credentials:'same-origin', cache:'no-store', headers:{accept:'application/json'}});
    return {status:response.status, data:response.ok ? await response.json() : {}};
  } catch {
    return {status:0, data:{}};
  }
}

let pending;
export function staffCapabilities(refresh=false) {
  if (!pending || refresh) {
    pending = Promise.all([
      session('/api/reviewer/session'), session('/api/community/admin/session'), session('/api/gallery/session')
    ]).then(([reviewer, publisher, gallery]) => ({
      appeals:reviewer.data.appeals === true,
      competitions:reviewer.data.competitions === true,
      publishing:publisher.data.editor === true,
      gallery:gallery.data.authenticated === true && gallery.data.staff?.review === true,
      signedOut:reviewer.status === 401 && gallery.data.authenticated !== true,
      unavailable:[reviewer,publisher,gallery].some(result => !result.status || result.status >= 500)
    }));
  }
  return pending;
}

export function hasStaffTools(access) {
  return access.appeals || access.competitions || access.publishing || access.gallery;
}
