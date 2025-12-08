import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class OglImportService {
    private apiUrl = '/codex/api/ogl-import';

    constructor(private http: HttpClient) { }

    uploadZip(file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post(`${this.apiUrl}/import/zip`, formData);
    }
}
