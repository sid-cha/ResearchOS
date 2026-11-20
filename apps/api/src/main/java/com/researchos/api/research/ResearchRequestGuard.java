package com.researchos.api.research;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Bound JSON before Jackson creates an object graph; reject cross-site bridge use. */
@Component
@Order(1)
public class ResearchRequestGuard extends OncePerRequestFilter {
    private static final int MAX_BYTES=262144;
    @Override protected boolean shouldNotFilter(HttpServletRequest request){return !request.getRequestURI().startsWith("/api/research/v1/");}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
        response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");
        if(request.getHeader("Origin")!=null||"cross-site".equals(request.getHeader("Sec-Fetch-Site"))){reject(response,403,"Use the server-side research bridge");return;}
        if(!"POST".equals(request.getMethod())){chain.doFilter(request,response);return;}
        if(request.getContentType()==null||!request.getContentType().toLowerCase().matches("application/json(?:\\s*;.*)?")){reject(response,415,"Send application/json");return;}
        if(request.getContentLengthLong()>MAX_BYTES){reject(response,413,"Research payload exceeds 256KiB");return;}
        byte[] body=request.getInputStream().readNBytes(MAX_BYTES+1);if(body.length>MAX_BYTES){reject(response,413,"Research payload exceeds 256KiB");return;}
        chain.doFilter(new HttpServletRequestWrapper(request){
            @Override public ServletInputStream getInputStream(){ByteArrayInputStream bytes=new ByteArrayInputStream(body);return new ServletInputStream(){
                @Override public int read(){return bytes.read();}@Override public boolean isFinished(){return bytes.available()==0;}@Override public boolean isReady(){return true;}@Override public void setReadListener(ReadListener listener){}
            };}
            @Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8));}
        },response);
    }
    private void reject(HttpServletResponse response,int status,String message)throws IOException{response.setStatus(status);response.setContentType("application/json");response.getWriter().write("{\"error\":\""+message+"\"}");}
}
